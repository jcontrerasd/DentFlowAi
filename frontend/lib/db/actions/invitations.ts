'use server';
import { canActAsTecnico } from "@/lib/auth-helpers";
import { db } from '@/lib/db';
import { caseInvitation, clinicalCase, user, file, annotation, organization, dentalMaterial, restorationType, vitaShade, urgencyLevel } from '@/lib/db/schema';
import { eq, and, desc, ne, inArray } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { getSignedUrl } from '@/lib/gcs';
import { getArchivedCaseIdsForUser, isCaseArchivedByUser } from '@/lib/db/caseUserArchiveHelpers';
import { applyInvitationArchiveFlags } from '@/lib/invitations/invitationArchiveFlags';

export type InvitationStatus = 'pending' | 'quoted' | 'accepted' | 'confirmed' | 'rejected' | 'expired' | 'withdrawn';

export type InvitationItem = {
  id: string;
  caseId: string;
  caseNumber: string | null;
  internalName: string | null;
  restorationType: string | null;
  material: string | null;
  urgency: string | null;
  caseComplexity: string | null;
  serviceType: string | null;
  status: InvitationStatus;
  invitedAt: Date;
  expiresAt: Date | null;
  quotedPrice: number | null;
  quotedDays: number | null;
  /** Desglose obligatorio en casos integrales; null en solo_diseno / solo_fabricacion. */
  quotedDesignPrice?: number | null;
  quotedDesignDays?: number | null;
  quotedFabricationPrice?: number | null;
  quotedFabricationDays?: number | null;
  techNotes?: string | null;
  respondedAt?: Date | null;
  dentistRejectionFeedback?: string | null;
  isWinner: boolean;
  caseStatus: string;
  teeth: any;
  organizationName?: string | null;
  patientIdAnon?: string | null;
  createdAt?: Date;
  files?: any[];
  /** Archivado solo para el usuario actual (case_user_archive). */
  archivedByCurrentUser: boolean;
};

// S5-01 — Lista de invitaciones del técnico autenticado
export async function getMyInvitationsAction(): Promise<InvitationItem[]> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsTecnico(identity.role)) return [];

  try {
    const rows = await db
      .select({
        id: caseInvitation.id,
        status: caseInvitation.status,
        invitedAt: caseInvitation.invitedAt,
        expiresAt: caseInvitation.expiresAt,
        quotedPrice: caseInvitation.quotedPrice,
        quotedDays: caseInvitation.quotedDays,
        quotedDesignPrice: caseInvitation.quotedDesignPrice,
        quotedDesignDays: caseInvitation.quotedDesignDays,
        quotedFabricationPrice: caseInvitation.quotedFabricationPrice,
        quotedFabricationDays: caseInvitation.quotedFabricationDays,
        respondedAt: caseInvitation.respondedAt,
        caseId: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        internalName: clinicalCase.internalName,
        restorationType: restorationType.label,
        material: dentalMaterial.label,
        urgency: urgencyLevel.label,
        caseComplexity: clinicalCase.caseComplexity,
        serviceType: clinicalCase.serviceType,
        caseStatus: clinicalCase.status,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        teeth: clinicalCase.teeth,
        organizationName: organization.name,
        createdAt: clinicalCase.createdAt,
        patientIdAnon: clinicalCase.patientIdAnon,
      })
      .from(caseInvitation)
      .innerJoin(clinicalCase, eq(caseInvitation.clinicalCaseId, clinicalCase.id))
      .leftJoin(organization, eq(clinicalCase.organizationId, organization.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(and(
        eq(caseInvitation.technicianId, identity.id),
        ne(caseInvitation.status, 'withdrawn')
      ))
      .orderBy(desc(caseInvitation.invitedAt));

    const caseIds = rows.map(r => r.caseId);
    let allFiles: any[] = [];
    if (caseIds.length > 0) {
      allFiles = await db.select().from(file).where(inArray(file.clinicalCaseId, caseIds));
    }

    const mapped = rows.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      internalName: r.internalName,
      restorationType: r.restorationType,
      material: r.material,
      urgency: r.urgency,
      caseComplexity: r.caseComplexity,
      serviceType: r.serviceType,
      status: r.status as InvitationStatus,
      invitedAt: r.invitedAt,
      expiresAt: r.expiresAt,
      quotedPrice: r.quotedPrice,
      quotedDays: r.quotedDays,
      quotedDesignPrice: r.quotedDesignPrice,
      quotedDesignDays: r.quotedDesignDays,
      quotedFabricationPrice: r.quotedFabricationPrice,
      quotedFabricationDays: r.quotedFabricationDays,
      respondedAt: r.respondedAt,
      isWinner: r.assignedTechnicianId === identity.id,
      caseStatus: r.caseStatus,
      teeth: r.teeth,
      organizationName: r.organizationName,
      createdAt: r.createdAt,
      patientIdAnon: r.patientIdAnon,
      files: allFiles.filter((f) => f.clinicalCaseId === r.caseId),
    }));

    const archivedCaseIds = await getArchivedCaseIdsForUser(identity.id as string);
    return applyInvitationArchiveFlags(mapped, archivedCaseIds);
  } catch (error) {
    console.error('[getMyInvitationsAction] Error:', error);
    return [];
  }
}

// S5-01b — Invitación del técnico autenticado para un caso específico
export async function getMyInvitationForCaseAction(caseId: string): Promise<{ success: boolean; data: InvitationItem | null; error?: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsTecnico(identity.role)) return { success: false, data: null, error: 'No autorizado' };

  try {
    const [row] = await db
      .select({
        id: caseInvitation.id,
        status: caseInvitation.status,
        invitedAt: caseInvitation.invitedAt,
        expiresAt: caseInvitation.expiresAt,
        quotedPrice: caseInvitation.quotedPrice,
        quotedDays: caseInvitation.quotedDays,
        quotedDesignPrice: caseInvitation.quotedDesignPrice,
        quotedDesignDays: caseInvitation.quotedDesignDays,
        quotedFabricationPrice: caseInvitation.quotedFabricationPrice,
        quotedFabricationDays: caseInvitation.quotedFabricationDays,
        techNotes: caseInvitation.techNotes,
        respondedAt: caseInvitation.respondedAt,
        dentistRejectionFeedback: caseInvitation.dentistRejectionFeedback,
        caseId: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        internalName: clinicalCase.internalName,
        restorationType: restorationType.label,
        material: dentalMaterial.label,
        urgency: urgencyLevel.label,
        caseComplexity: clinicalCase.caseComplexity,
        serviceType: clinicalCase.serviceType,
        caseStatus: clinicalCase.status,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        teeth: clinicalCase.teeth,
      })
      .from(caseInvitation)
      .innerJoin(clinicalCase, eq(caseInvitation.clinicalCaseId, clinicalCase.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(and(
        eq(caseInvitation.clinicalCaseId, caseId),
        eq(caseInvitation.technicianId, identity.id),
      ))
      .orderBy(desc(caseInvitation.invitedAt))
      .limit(1);

    if (!row) return { success: true, data: null };

    const archivedByCurrentUser = await isCaseArchivedByUser(caseId, identity.id as string);

    return {
      success: true,
      data: {
        id: row.id,
        caseId: row.caseId,
        caseNumber: row.caseNumber,
        internalName: row.internalName,
        restorationType: row.restorationType,
        material: row.material,
        urgency: row.urgency,
        caseComplexity: row.caseComplexity,
        serviceType: row.serviceType,
        status: row.status as InvitationStatus,
        invitedAt: row.invitedAt,
        expiresAt: row.expiresAt,
        quotedPrice: row.quotedPrice,
        quotedDays: row.quotedDays,
        quotedDesignPrice: row.quotedDesignPrice,
        quotedDesignDays: row.quotedDesignDays,
        quotedFabricationPrice: row.quotedFabricationPrice,
        quotedFabricationDays: row.quotedFabricationDays,
        techNotes: row.techNotes,
        respondedAt: row.respondedAt,
        dentistRejectionFeedback: row.dentistRejectionFeedback,
        isWinner: row.assignedTechnicianId === identity.id,
        caseStatus: row.caseStatus,
        teeth: row.teeth,
        archivedByCurrentUser,
      },
    };
  } catch (error) {
    console.error('[getMyInvitationForCaseAction] Error:', error);
    return { success: false, data: null, error: String(error) };
  }
}

// S5-02 — Detalle de una invitación específica (con specs del caso)
export async function getInvitationDetailsAction(invitationId: string) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado', data: null };

  try {
    const [row] = await db
      .select({
        inv: caseInvitation,
        case: {
          id: clinicalCase.id,
          caseNumber: clinicalCase.caseNumber,
          internalName: clinicalCase.internalName,
          restorationType: restorationType.label,
          material: dentalMaterial.label,
          shade: vitaShade.label,
          teeth: clinicalCase.teeth,
          urgency: urgencyLevel.label,
          caseComplexity: clinicalCase.caseComplexity,
          serviceType: clinicalCase.serviceType,
          doctorNotes: clinicalCase.doctorNotes,
          specialInstructions: clinicalCase.specialInstructions,
          notesEsthetic: clinicalCase.notesEsthetic,
          notesOclusal: clinicalCase.notesOclusal,
          status: clinicalCase.status,
          needsFabrication: clinicalCase.needsFabrication,
          organizationId: clinicalCase.organizationId,
          assignedTechnicianId: clinicalCase.assignedTechnicianId,
        },
      })
      .from(caseInvitation)
      .innerJoin(clinicalCase, eq(caseInvitation.clinicalCaseId, clinicalCase.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(vitaShade, eq(vitaShade.id, clinicalCase.shadeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(and(
        eq(caseInvitation.id, invitationId),
        eq(caseInvitation.technicianId, identity.id)
      ))
      .limit(1);

    if (!row) return { success: false, error: 'Invitación no encontrada', data: null };

    // Archivos del caso
    const caseFiles = await db
      .select({
        id: file.id,
        gcsPath: file.gcsPath,
        category: file.category,
        subType: file.subType,
        thumbnailPath: file.thumbnailPath,
        mimeType: file.mimeType,
        filename: file.filename,
        size: file.size,
      })
      .from(file)
      .where(eq(file.clinicalCaseId, row.case.id));

    // Anotaciones del caso (read-only para el técnico)
    const caseAnnotations = await db
      .select({
        id: annotation.id,
        text: annotation.text,
        coordinates: annotation.coordinates,
        fullName: user.fullName,
      })
      .from(annotation)
      .leftJoin(user, eq(annotation.userId, user.id))
      .where(eq(annotation.clinicalCaseId, row.case.id));

    // Técnicos invitados siempre ven los scans 3D — necesitan verlos para cotizar correctamente.
    // Los archivos de otro tipo (diseños, entregas) solo se desbloquean al confirmar.
    const canAccessFiles = row.inv.status === 'confirmed';

    const signedFiles = await Promise.all(caseFiles.map(async f => {
      const isScan = f.category === 'scan';

      let thumbnailUrl: string | null = null;
      if (f.thumbnailPath) {
        try { thumbnailUrl = await getSignedUrl(f.thumbnailPath); } catch {}
      }

      // Scans siempre firmados (necesarios para el visor 3D al cotizar)
      // Otros archivos solo si la invitación está confirmada
      let gcsUrl: string | null = null;
      if (f.gcsPath && (isScan || canAccessFiles)) {
        try { gcsUrl = await getSignedUrl(f.gcsPath); } catch {}
      }

      return { ...f, thumbnailUrl, gcsUrl };
    }));

    const annotations = caseAnnotations.map(a => ({
      id: a.id,
      text: a.text,
      coordinates: a.coordinates as { x: number; y: number; z: number },
      user: { fullName: a.fullName || 'Sistema' },
    }));

    return {
      success: true,
      data: {
        invitation: row.inv,
        clinicalCase: row.case,
        files: signedFiles,
        annotations,
        canAccessFiles,
      },
    };
  } catch (error) {
    console.error('[getInvitationDetailsAction] Error:', error);
    return { success: false, error: String(error), data: null };
  }
}
