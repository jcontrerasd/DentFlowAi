export type ExtractedModel = {
  fileName: string;
  blobUrl: string;
  subType: string;
};

const MODEL_EXTENSIONS = ['.stl', '.ply', '.obj'];

function inferSubType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes('superior')) return 'superior';
  if (lower.includes('inferior')) return 'inferior';
  if (lower.includes('oclusal')) return 'oclusal';
  return 'modelo';
}

export async function extractModelsFromZip(zipUrl: string): Promise<ExtractedModel[]> {
  const JSZip = (await import('jszip')).default;

  const response = await fetch(zipUrl);
  if (!response.ok) throw new Error(`Error al descargar ZIP: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const models: ExtractedModel[] = [];

  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const fileName = relativePath.split('/').pop() ?? relativePath;
    const lower = fileName.toLowerCase();
    if (!MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;

    const blob = await file.async('blob');
    const blobUrl = URL.createObjectURL(blob) + '#' + fileName;
    models.push({ fileName, blobUrl, subType: inferSubType(fileName) });
  }

  return models;
}
