'use server';

import JSZip from 'jszip';
import { db, infraPromise } from '@/lib/db';
import {
  dataExportRequest,
  clinicalCase,
  clinicalCaseDelivery,
  caseAssignment,
  dentalMaterial,
  restorationType as restorationTypeTable,
  vitaShade,
  urgencyLevel,
  user as userTable,
  review,
} from '@/lib/db/schema';
import { eq, and, or, sql, desc, gt, lte, isNull, inArray } from 'drizzle-orm';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getUserProfileDirect } from '@/lib/db/actions/user';
import { getSignedUrl, downloadFileBuffer, deleteFile } from '@/lib/gcs';
import { notifyUser } from '@/lib/services/notifications';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export type DataExportRequestStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

export type ActiveDataExportRequest = {
  id: string;
  status: DataExportRequestStatus;
  requestedAt: Date;
  expiresAt: Date | null;
};

/** Devuelve la solicitud activa del usuario (pending/processing/ready no vencida), o null. */
async function findActiveRequest(userId: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: dataExportRequest.id,
      status: dataExportRequest.status,
      requestedAt: dataExportRequest.requestedAt,
      expiresAt: dataExportRequest.expiresAt,
    })
    .from(dataExportRequest)
    .where(
      and(
        eq(dataExportRequest.userId, userId),
        or(
          inArray(dataExportRequest.status, ['pending', 'processing']),
          and(
            eq(dataExportRequest.status, 'ready'),
            gt(dataExportRequest.expiresAt, now),
          ),
        ),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, status: row.status as DataExportRequestStatus };
}

/**
 * Devuelve la solicitud activa del usuario autenticado para que la UI muestre el estado correcto.
 */
export async function getMyActiveDataExportRequestAction(): Promise<{
  success: boolean;
  data?: ActiveDataExportRequest | null;
  error?: string;
}> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    const active = await findActiveRequest(identity.id);
    return { success: true, data: active };
  } catch (error) {
    console.error('[getMyActiveDataExportRequestAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Crea una nueva solicitud de exportación de datos para el usuario autenticado.
 * Rechaza si ya existe una solicitud activa (pending, processing, o ready no vencida).
 * Usa pg_advisory_xact_lock para serializar el check+insert y evitar race conditions
 * en el primer request de un usuario (cuando todavía no hay fila que lockear con FOR UPDATE).
 */
export async function requestDataExportAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (infraPromise) await infraPromise;
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    const userId = identity.id;

    // pg_advisory_xact_lock DEBE estar dentro de una transacción explícita para que
    // el lock se libere en el COMMIT y no inmediatamente (sin tx se libera al instante).
    const txResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

      const active = await findActiveRequest(userId);
      if (active) return { blocked: true as const, active };

      await tx.insert(dataExportRequest).values({ userId, status: 'pending' });
      return { blocked: false as const };
    });

    if (txResult.blocked) {
      const { active } = txResult;
      const expMsg = active.expiresAt
        ? ` Vence el ${active.expiresAt.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}.`
        : '';
      return {
        success: false,
        error: `Ya tienes una solicitud activa (${active.status}).${expMsg} Te avisaremos por correo cuando esté lista.`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[requestDataExportAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Procesa UNA solicitud pending (FIFO): arma el ZIP, lo sube a GCS y notifica al usuario.
 * Llamado por el cron /api/cron/process-data-exports.
 */
export async function processPendingDataExportsAction(): Promise<{
  success: boolean;
  processed?: number;
  error?: string;
}> {
  try {
    // Toma la solicitud más antigua en estado pending
    const [pending] = await db
      .select()
      .from(dataExportRequest)
      .where(eq(dataExportRequest.status, 'pending'))
      .orderBy(dataExportRequest.requestedAt)
      .limit(1);

    if (!pending) return { success: true, processed: 0 };

    // Marca como processing
    await db
      .update(dataExportRequest)
      .set({ status: 'processing' })
      .where(eq(dataExportRequest.id, pending.id));

    try {
      const userId = pending.userId;

      // Recopila datos del usuario
      const profile = await getUserProfileDirect(userId);
      if (!profile) throw new Error('Usuario no encontrado');
      const { organization: orgData, ...usuario } = profile;

      // Casos del usuario — con catálogos y técnico asignado resueltos
      const casosRaw = await db
        .select({
          id: clinicalCase.id,
          caseNumber: clinicalCase.caseNumber,
          internalName: clinicalCase.internalName,
          serviceType: clinicalCase.serviceType,
          status: clinicalCase.status,
          internalStatus: clinicalCase.internalStatus,
          rolEnElCaso: sql<string>`CASE WHEN ${clinicalCase.doctorId} = ${userId} THEN 'dentista' WHEN ${clinicalCase.assignedTechnicianId} = ${userId} THEN 'tecnico' ELSE 'calidad' END`,
          // Datos clínicos
          teeth: clinicalCase.teeth,
          replacesMissingTeeth: clinicalCase.replacesMissingTeeth,
          derivedWorkType: clinicalCase.derivedWorkType,
          derivedCategory: clinicalCase.derivedCategory,
          doctorNotes: clinicalCase.doctorNotes,
          specialInstructions: clinicalCase.specialInstructions,
          // Catálogos resueltos a label
          material: dentalMaterial.label,
          restorationType: restorationTypeTable.label,
          shade: vitaShade.label,
          urgency: urgencyLevel.label,
          // Precio y plazo
          listPriceSale: clinicalCase.listPriceSale,
          desiredDeliveryAt: clinicalCase.desiredDeliveryAt,
          proposedPrice: clinicalCase.proposedPrice,
          proposedDeliveryDays: clinicalCase.proposedDeliveryDays,
          workDeadline: clinicalCase.workDeadline,
          // Técnico asignado
          assignedTechnicianName: userTable.fullName,
          assignedTechnicianEmail: userTable.email,
          // Fechas
          createdAt: clinicalCase.createdAt,
          publishedAt: clinicalCase.publishedAt,
          startedAt: clinicalCase.startedAt,
          completedAt: clinicalCase.completedAt,
          workStartedAt: clinicalCase.workStartedAt,
          lastRevisionSubmittedAt: clinicalCase.lastRevisionSubmittedAt,
        })
        .from(clinicalCase)
        .leftJoin(dentalMaterial, eq(clinicalCase.materialId, dentalMaterial.id))
        .leftJoin(restorationTypeTable, eq(clinicalCase.restorationTypeId, restorationTypeTable.id))
        .leftJoin(vitaShade, eq(clinicalCase.shadeId, vitaShade.id))
        .leftJoin(urgencyLevel, eq(clinicalCase.urgencyId, urgencyLevel.id))
        .leftJoin(userTable, eq(clinicalCase.assignedTechnicianId, userTable.id))
        .where(or(
          eq(clinicalCase.doctorId, userId),
          eq(clinicalCase.assignedTechnicianId, userId),
          eq(clinicalCase.qualityReviewerId, userId),
        ));

      // Arma el ZIP
      const zip = new JSZip();

      const casosJson: object[] = [];

      for (const caso of casosRaw) {
        // Asignación activa (pending o accepted)
        const [assignment] = await db
          .select({
            status: caseAssignment.status,
            compensation: caseAssignment.compensation,
            deadlineDays: caseAssignment.deadlineDays,
            assignedAt: caseAssignment.assignedAt,
            expiresAt: caseAssignment.expiresAt,
            workType: caseAssignment.workType,
          })
          .from(caseAssignment)
          .where(
            and(
              eq(caseAssignment.clinicalCaseId, caso.id),
              inArray(caseAssignment.status, ['pending', 'accepted']),
            ),
          )
          .limit(1);

        // Última entrega (cualquier estado — para contexto de progreso)
        const [lastDelivery] = await db
          .select({
            version: clinicalCaseDelivery.version,
            status: clinicalCaseDelivery.status,
            notes: clinicalCaseDelivery.notes,
            files: clinicalCaseDelivery.files,
            reviewComment: clinicalCaseDelivery.reviewComment,
            qualityStatus: clinicalCaseDelivery.qualityStatus,
            qualityComment: clinicalCaseDelivery.qualityComment,
            createdAt: clinicalCaseDelivery.createdAt,
            reviewedAt: clinicalCaseDelivery.reviewedAt,
          })
          .from(clinicalCaseDelivery)
          .where(eq(clinicalCaseDelivery.clinicalCaseId, caso.id))
          .orderBy(desc(clinicalCaseDelivery.version))
          .limit(1);

        // Entrega aprobada (para incluir los archivos físicos en el ZIP)
        const [approvedDelivery] = await db
          .select({ files: clinicalCaseDelivery.files })
          .from(clinicalCaseDelivery)
          .where(
            and(
              eq(clinicalCaseDelivery.clinicalCaseId, caso.id),
              eq(clinicalCaseDelivery.status, 'approved'),
            ),
          )
          .orderBy(desc(clinicalCaseDelivery.version))
          .limit(1);

        // Calificación emitida (más reciente)
        const [rating] = await db
          .select({
            rating: review.rating,
            dimension: review.dimension,
            createdAt: review.createdAt,
          })
          .from(review)
          .where(eq(review.clinicalCaseId, caso.id))
          .orderBy(desc(review.createdAt))
          .limit(1);

        // Archivos físicos en ZIP (solo entrega aprobada)
        const archivos: { path: string }[] = [];
        if (approvedDelivery?.files?.length) {
          const folder = zip.folder(`casos/${caso.id}`);
          for (const gcsPath of approvedDelivery.files) {
            const buffer = await downloadFileBuffer(gcsPath);
            if (buffer && folder) {
              const filename = gcsPath.split('/').pop() ?? gcsPath;
              folder.file(filename, buffer);
              archivos.push({ path: `casos/${caso.id}/${filename}` });
            }
          }
        }

        const { assignedTechnicianName, assignedTechnicianEmail, ...casoBase } = caso;

        casosJson.push({
          ...casoBase,
          tecnicoAsignado: assignedTechnicianName
            ? { nombre: assignedTechnicianName, email: assignedTechnicianEmail }
            : null,
          asignacion: assignment ?? null,
          ultimaEntrega: lastDelivery
            ? { ...lastDelivery, files: undefined }
            : null,
          archivosEntregaFinal: archivos,
          calificacion: rating ?? null,
        });
      }

      const dataJson = {
        generatedAt: new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false }).replace(' ', 'T') + ' (America/Santiago)',
        usuario,
        organizacion: orgData ?? null,
        casos: casosJson,
      };

      zip.file('data.json', JSON.stringify(dataJson, null, 2));

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      // Sube el ZIP al bucket
      const gcsPath = `exports/${userId}/${pending.id}.zip`;

      // Usa el SDK de GCS directamente para subir el buffer
      const { Storage } = await import('@google-cloud/storage');
      const storageOptions: ConstructorParameters<typeof Storage>[0] = {
        projectId: process.env.GCP_PROJECT_ID,
      };
      if (process.env.GCS_API_ENDPOINT) {
        storageOptions.apiEndpoint = process.env.GCS_API_ENDPOINT;
      } else {
        storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      const storage = new Storage(storageOptions);
      const bucketName = process.env.GCP_BUCKET_NAME || 'dentflowai-assets-prod';
      await storage.bucket(bucketName).file(gcsPath).save(zipBuffer, {
        contentType: 'application/zip',
        metadata: { contentDisposition: `attachment; filename="dentflowai-mis-datos.zip"` },
      });

      // Genera signed URL con TTL de 2 días
      const downloadUrl = await getSignedUrl(gcsPath, TWO_DAYS_MS);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + TWO_DAYS_MS);

      await db
        .update(dataExportRequest)
        .set({ status: 'ready', gcsPath, downloadUrl, readyAt: now, expiresAt })
        .where(eq(dataExportRequest.id, pending.id));

      // Notifica al usuario
      await notifyUser(userId, 'DATOS_EXPORTACION_LISTA', {
        downloadUrl,
        expiresAt: expiresAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' }),
      });

      return { success: true, processed: 1 };
    } catch (innerError) {
      // Marca como fallido para no bloquear al usuario
      await db
        .update(dataExportRequest)
        .set({ status: 'failed', errorMessage: String(innerError) })
        .where(eq(dataExportRequest.id, pending.id));
      throw innerError;
    }
  } catch (error) {
    console.error('[processPendingDataExportsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Elimina del bucket los ZIPs vencidos y actualiza su estado a 'expired'.
 * Llamado por el cron /api/cron/process-data-exports.
 */
export async function purgeExpiredDataExportsAction(): Promise<{
  success: boolean;
  purged?: number;
  error?: string;
}> {
  try {
    const now = new Date();
    const expired = await db
      .select({ id: dataExportRequest.id, gcsPath: dataExportRequest.gcsPath })
      .from(dataExportRequest)
      .where(
        and(
          eq(dataExportRequest.status, 'ready'),
          lte(dataExportRequest.expiresAt, now),
          isNull(dataExportRequest.deletedAt),
        ),
      );

    for (const row of expired) {
      if (row.gcsPath) {
        await deleteFile(row.gcsPath);
      }
      await db
        .update(dataExportRequest)
        .set({ status: 'expired', deletedAt: now })
        .where(eq(dataExportRequest.id, row.id));
    }

    return { success: true, purged: expired.length };
  } catch (error) {
    console.error('[purgeExpiredDataExportsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}
