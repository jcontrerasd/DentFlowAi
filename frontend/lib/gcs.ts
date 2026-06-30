'use server';

import { Storage } from '@google-cloud/storage';

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

// Caché en memoria por proceso: clave = ruta GCS, valor = { url, expiresAt }
// Las URLs firmadas duran 15 min; las invalidamos a los 5 min para dar margen de seguridad.
const _urlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const LOCAL_GCS = !!process.env.GCS_API_ENDPOINT;

/**
 * Genera (o recupera del caché en proceso) una URL firmada de lectura para un archivo en GCS.
 * @param expiresInMs TTL en ms (default 15 min). Máximo 7 días para v4 signing.
 *   URLs con TTL > CACHE_TTL_MS no se cachean para evitar servir links ya vencidos.
 */
export async function getSignedUrl(fileName: string, expiresInMs = 15 * 60 * 1000) {
  try {
    if (LOCAL_GCS) {
      return `${process.env.GCS_API_ENDPOINT}/download/storage/v1/b/${bucketName}/o/${encodeURIComponent(fileName)}?alt=media`;
    }

    const useCache = expiresInMs <= CACHE_TTL_MS * 3;
    if (useCache) {
      const cached = _urlCache.get(fileName);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
      }
    }

    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + expiresInMs,
    };
    const [url] = await storage.bucket(bucketName).file(fileName).getSignedUrl(options);

    if (useCache) {
      _urlCache.set(fileName, { url, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return url;
  } catch (error) {
    console.error("[getSignedUrl] Error:", error);
    return null;
  }
}

/**
 * Descarga el contenido de un archivo GCS como Buffer.
 * Útil para armado de ZIPs server-side sin escribir a disco.
 */
export async function downloadFileBuffer(fileName: string): Promise<Buffer | null> {
  try {
    const [contents] = await storage.bucket(bucketName).file(fileName).download();
    return contents;
  } catch (error) {
    console.error("[downloadFileBuffer] Error:", error);
    return null;
  }
}

/**
 * Elimina un archivo del bucket. ignoreNotFound=true evita error si ya fue borrado.
 */
export async function deleteFile(fileName: string): Promise<void> {
  try {
    await storage.bucket(bucketName).file(fileName).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error("[deleteFile] Error:", error);
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
    if (LOCAL_GCS) {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return `${base}/api/local-gcs-proxy?name=${encodeURIComponent(fileName)}`;
    }

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
