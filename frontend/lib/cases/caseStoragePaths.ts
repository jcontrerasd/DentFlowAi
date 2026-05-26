/**
 * Rutas GCS asociadas a un caso clínico (tabla file).
 */

export type CaseFileStorageRow = {
  gcsPath: string | null;
  thumbnailPath: string | null;
};

export function caseStoragePrefix(organizationId: string, caseId: string): string {
  return `organizations/${organizationId}/cases/${caseId}/`;
}

/** Recopila gcsPath y thumbnailPath únicos y no vacíos. */
export function collectCaseStoragePaths(rows: CaseFileStorageRow[]): string[] {
  const paths = new Set<string>();
  for (const row of rows) {
    const gcs = String(row.gcsPath ?? '').trim();
    const thumb = String(row.thumbnailPath ?? '').trim();
    if (gcs) paths.add(gcs);
    if (thumb) paths.add(thumb);
  }
  return [...paths];
}
