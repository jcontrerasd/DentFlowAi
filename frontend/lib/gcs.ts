'use server';

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const bucketName = process.env.GCP_BUCKET_NAME || 'dentflowai-assets-prod';

// Caché en memoria por proceso: clave = ruta GCS, valor = { url, expiresAt }
// Las URLs firmadas duran 15 min; las invalidamos a los 5 min para dar margen de seguridad.
const _urlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Genera (o recupera del caché en proceso) una URL firmada de lectura para un archivo en GCS.
 */
export async function getSignedUrl(fileName: string) {
  try {
    const cached = _urlCache.get(fileName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutos
    };
    const [url] = await storage.bucket(bucketName).file(fileName).getSignedUrl(options);

    _urlCache.set(fileName, { url, expiresAt: Date.now() + CACHE_TTL_MS });
    return url;
  } catch (error) {
    console.error("[getSignedUrl] Error:", error);
    return null;
  }
}

/**
 * Genera una URL de subida (Upload) para nuevos archivos.
 *
 * `contentEncoding` opcional: cuando se pasa 'gzip', firma la URL exigiendo que
 * el cliente envíe `Content-Encoding: gzip` en el PUT. GCS guarda los bytes
 * comprimidos y aplica decompressive transcoding al servirlos.
 */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
  options?: { contentEncoding?: 'gzip' }
) {
  try {
    const signOptions = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
      ...(options?.contentEncoding
        ? { extensionHeaders: { 'content-encoding': options.contentEncoding } }
        : {}),
    };
    const [url] = await storage.bucket(bucketName).file(fileName).getSignedUrl(signOptions);
    return url;
  } catch (error) {
    console.error("[getUploadUrl] Error:", error);
    return null;
  }
}
