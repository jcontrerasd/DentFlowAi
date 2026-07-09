/**
 * Sube un archivo a una signed URL de GCS vía PUT usando XMLHttpRequest, ya que
 * fetch() no expone eventos de progreso de subida (xhr.upload.onprogress sí).
 */
type UploadBody = Blob | ArrayBuffer | string | File;

export function uploadWithProgress(
  url: string,
  body: UploadBody,
  headers: Record<string, string>,
  onProgress?: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

    xhr.upload.onprogress = (event) => {
      if (onProgress) onProgress(event.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(getBodySize(body));
        resolve();
      } else {
        reject(new Error(`Fallo en la subida: el servidor de almacenamiento respondió ${xhr.status}.`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de conexión con el almacenamiento durante la subida.'));

    xhr.send(body);
  });
}

function getBodySize(body: UploadBody): number {
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (typeof body === 'string') return body.length;
  return 0;
}
