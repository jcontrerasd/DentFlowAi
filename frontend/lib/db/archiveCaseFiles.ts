import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { file } from '@/lib/db/schema';
import GCPStorageService from '@/lib/services/gcp-storage';
import { collectCaseStoragePaths } from '@/lib/cases/caseStoragePaths';

/**
 * Marca los archivos GCS de un caso con `customTime` para que la lifecycle policy
 * los transicione a clases más baratas (Nearline → Coldline → Archive).
 *
 * Se invoca al cerrar un caso (estado terminal: completado / disenoAprobado / cerrado).
 * Best-effort: nunca lanza ni bloquea la transición.
 */
export async function archiveCaseFilesBestEffort(caseId: string): Promise<void> {
  try {
    const rows = await db
      .select({ gcsPath: file.gcsPath, thumbnailPath: file.thumbnailPath })
      .from(file)
      .where(eq(file.clinicalCaseId, caseId));
    const paths = collectCaseStoragePaths(rows);
    if (paths.length === 0) return;
    await GCPStorageService.markFilesForArchival(paths);
  } catch (err) {
    console.error('[archiveCaseFilesBestEffort] Error marcando archivos:', err);
  }
}
