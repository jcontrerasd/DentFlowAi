'use server';

import { db } from "@/lib/db";
import { file, clinicalCase, annotation } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getServerIdentity } from "@/lib/db/actions/impersonation";
import GCPStorageService from "@/lib/services/gcp-storage";

/**
 * Registra un nuevo archivo asociado a un caso clínico.
 */
export async function registerFileAction(data: {
  caseId: string;
  organizationId: string;
  uploaderId: string;
  filename: string;
  category: string;
  subType?: string;
  size: number;
  mimeType: string;
  gcsPath: string;
  thumbnailPath?: string;
}) {
  try {
    const [newFile] = await db
      .insert(file as any)
      .values({
        clinicalCaseId: data.caseId,
        organizationId: data.organizationId,
        uploaderId: data.uploaderId,
        filename: data.filename,
        category: data.category,
        subType: data.subType || 'default',
        size: data.size,
        mimeType: data.mimeType,
        gcsPath: data.gcsPath,
        thumbnailPath: data.thumbnailPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    return newFile;
  } catch (error) {
    console.error("[registerFileAction] Error:", error);
    throw error;
  }
}

/**
 * Elimina un archivo clínico de un caso en borrador.
 * Valida que el caso esté en borrador y pertenezca a la org del usuario.
 * Borra de GCS (archivo + miniatura) y de la DB.
 */
export async function deleteCaseFileAction(fileId: string) {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) {
      return { success: false, error: 'No autorizado' };
    }

    const [fileRow] = await db.select().from(file).where(eq(file.id, fileId)).limit(1);
    if (!fileRow) {
      return { success: false, error: 'Archivo no encontrado' };
    }

    const [caseRow] = await db
      .select({ id: clinicalCase.id, status: clinicalCase.status, organizationId: clinicalCase.organizationId })
      .from(clinicalCase as any)
      .where(eq(clinicalCase.id, fileRow.clinicalCaseId as string))
      .limit(1);

    if (!caseRow) {
      return { success: false, error: 'Caso no encontrado' };
    }
    if (caseRow.organizationId !== identity.orgId) {
      return { success: false, error: 'No autorizado' };
    }
    if (caseRow.status !== 'borrador') {
      return { success: false, error: 'Solo se pueden eliminar archivos en casos en borrador' };
    }

    const pathsToDelete = [fileRow.gcsPath, fileRow.thumbnailPath].filter(Boolean) as string[];
    await GCPStorageService.deleteFiles(pathsToDelete).catch(() => undefined);

    await db.delete(file).where(eq(file.id, fileId));

    // Las notas 3D se posicionan sobre la geometría de los scans clínicos:
    // si el dentista elimina archivos del caso en borrador, las anotaciones
    // pierden referencia espacial y se eliminan también.
    const deletedAnnotations = await db
      .delete(annotation)
      .where(eq(annotation.clinicalCaseId, caseRow.id))
      .returning({ id: annotation.id });

    return { success: true, deletedAnnotations: deletedAnnotations.length };
  } catch (error) {
    console.error("[deleteCaseFileAction] Error:", error);
    return { success: false, error: 'Error al eliminar el archivo' };
  }
}

/**
 * Actualiza la ruta de la miniatura de un archivo (BL-042).
 */
export async function updateFileThumbnailAction(fileId: string, thumbnailPath: string) {
  try {
    await db.update(file)
      .set({ thumbnailPath })
      .where(eq(file.id, fileId));
    return { success: true };
  } catch (error) {
    console.error("[updateFileThumbnailAction] Error:", error);
    return { success: false, error };
  }
}

/**
 * Registra en auditoría la descarga de un archivo (BL-041).
 */
export async function logFileDownloadAction(data: {
  fileId: string;
  filename: string;
  organizationId: string;
  userId: string;
}) {
  try {
    const { auditLog } = await import("@/lib/db/schema");
    await db.insert(auditLog).values({
      organizationId: data.organizationId,
      userId: data.userId,
      action: "FILE_DOWNLOADED",
      payload: { fileId: data.fileId, filename: data.filename },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("[logFileDownloadAction] Error:", error);
    // Non-blocking error
  }
}
