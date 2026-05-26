/**
 * Compresión gzip transparente para uploads a GCS.
 *
 * Comprime con `CompressionStream('gzip')` solo extensiones altamente comprimibles
 * (modelos 3D: STL/PLY/OBJ). GCS persiste el blob con `Content-Encoding: gzip` y
 * aplica decompressive transcoding al servirlo — el visor 3D no requiere cambios.
 *
 * Imágenes/PDF/WebP NO se comprimen porque ya están comprimidos internamente.
 */

export const GZIP_COMPRESSIBLE_EXTENSIONS = ['.stl', '.ply', '.obj'] as const;

export type MaybeGzipResult = {
  body: Blob | File;
  contentEncoding?: 'gzip';
};

/** Devuelve la extensión en minúsculas (incluyendo el punto), o null si no la hay. */
export function getFileExtension(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : null;
}

/** Indica si un nombre de archivo debe comprimirse con gzip antes del upload. */
export function isGzipCompressible(filename: string): boolean {
  const ext = getFileExtension(filename);
  return !!ext && (GZIP_COMPRESSIBLE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Si el archivo es comprimible, devuelve un Blob gzipeado + contentEncoding 'gzip'.
 * En caso contrario, devuelve el File original sin tocar.
 *
 * Requiere `CompressionStream` (disponible en todos los browsers modernos soportados
 * por Next.js 15 / React 19). Si no está disponible, hace passthrough.
 */
export async function maybeGzipForUpload(file: File | Blob & { name?: string }): Promise<MaybeGzipResult> {
  const name = (file as File).name ?? '';
  if (!name || !isGzipCompressible(name)) {
    return { body: file as File };
  }

  if (
    typeof (globalThis as any).CompressionStream === 'undefined' ||
    typeof (file as File).stream !== 'function'
  ) {
    return { body: file as File };
  }

  try {
    const stream = (file as File).stream().pipeThrough(new (globalThis as any).CompressionStream('gzip'));
    const compressed = await new Response(stream).blob();
    return { body: compressed, contentEncoding: 'gzip' };
  } catch (err) {
    console.warn('[maybeGzipForUpload] Falló compresión, subiendo sin gzip:', err);
    return { body: file as File };
  }
}
