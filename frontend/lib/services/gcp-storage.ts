import { Storage } from '@google-cloud/storage';

/**
 * Utilidad para gestionar operaciones físicas en Google Cloud Storage.
 */
class GCPStorageService {
  private static _storage: Storage | null = null;
  private static _bucket: any = null;

  private static getStorage() {
    if (!this._storage) {
      console.log("[GCPStorage] Inicializando con Project:", process.env.GCP_PROJECT_ID);
      if (!process.env.GCP_PROJECT_ID) {
        console.error("[GCPStorage] ERROR: GCP_PROJECT_ID no definido.");
      }
      const storageOptions: ConstructorParameters<typeof Storage>[0] = {
        projectId: process.env.GCP_PROJECT_ID,
      };
      if (process.env.GCS_API_ENDPOINT) {
        storageOptions.apiEndpoint = process.env.GCS_API_ENDPOINT;
      } else {
        storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      this._storage = new Storage(storageOptions);
    }
    return this._storage;
  }

  private static getBucket() {
    if (!this._bucket) {
      const bucketName = process.env.GCP_BUCKET_NAME;
      if (!bucketName) console.error("[GCPStorage] ERROR: GCP_BUCKET_NAME no definido.");
      this._bucket = this.getStorage().bucket(bucketName || '');
    }
    return this._bucket;
  }

  /**
   * Borra un archivo físico del Bucket.
   * @param storagePath La ruta guardada en la DB (ej: 'cases/123/file.stl')
   */
  static async deleteFile(storagePath: string) {
    if (!storagePath) return;
    try {
      await this.deleteFileStrict(storagePath);
    } catch (error) {
      console.error(`[GCPStorage] Error al eliminar archivo ${storagePath}:`, error);
    }
  }

  /**
   * Borra un objeto en GCS; propaga error (borrado consistente de caso).
   */
  static async deleteFileStrict(storagePath: string): Promise<void> {
    if (!storagePath) return;
    const path = this.normalizePath(storagePath);
    const bucket = this.getBucket();
    const file = bucket.file(path);

    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      console.log(`[GCPStorage] Archivo eliminado: ${path}`);
    }
  }

  /**
   * Borra múltiples archivos en lote (best-effort).
   */
  static async deleteFiles(storagePaths: string[]) {
    await Promise.all(storagePaths.map(path => this.deleteFile(path)));
  }

  /**
   * Borra múltiples archivos; falla si cualquier delete lanza.
   */
  static async deleteFilesStrict(storagePaths: string[]): Promise<void> {
    const unique = [...new Set(storagePaths.filter(Boolean))];
    await Promise.all(unique.map((path) => this.deleteFileStrict(path)));
  }

  private static normalizePath(storagePath: string): string {
    return storagePath.replace(/^gs:\/\/[^/]+\//, '');
  }

  /**
   * Marca objetos para que la lifecycle policy del bucket los transicione a clases
   * más baratas (Nearline → Coldline → Archive) usando `customTime`.
   * Se invoca al cerrar un caso (estado terminal). No falla la transición del caso
   * si una metadata falla — solo loggea.
   */
  static async markFilesForArchival(storagePaths: string[]): Promise<void> {
    const unique = [...new Set((storagePaths || []).map((p) => (p || '').trim()).filter(Boolean))];
    if (unique.length === 0) return;
    const bucket = this.getBucket();
    const now = new Date().toISOString();
    const results = await Promise.allSettled(
      unique.map((raw) => bucket.file(this.normalizePath(raw)).setMetadata({ customTime: now })),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        console.error(`[GCPStorage] markFilesForArchival fallo en ${unique[i]}:`, r.reason);
      }
    }
  }

  /**
   * Limpia `customTime` en objetos GCS. Se usa al clonar un caso terminal:
   * la copia hereda metadata del origen (incluyendo `customTime`), pero el
   * clon es un caso nuevo que debe arrancar limpio en Standard.
   * Best-effort: no falla la operación si una metadata falla.
   */
  static async clearArchivalMark(storagePaths: string[]): Promise<void> {
    const unique = [...new Set((storagePaths || []).map((p) => (p || '').trim()).filter(Boolean))];
    if (unique.length === 0) return;
    const bucket = this.getBucket();
    const results = await Promise.allSettled(
      unique.map((raw) => bucket.file(this.normalizePath(raw)).setMetadata({ customTime: null })),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        console.error(`[GCPStorage] clearArchivalMark fallo en ${unique[i]}:`, r.reason);
      }
    }
  }

  /**
   * Copia un objeto dentro del mismo bucket (independencia entre casos).
   */
  static async copyFile(sourcePath: string, destPath: string): Promise<void> {
    if (!sourcePath || !destPath) {
      throw new Error('[GCPStorage] copyFile: rutas vacías');
    }
    const src = this.normalizePath(sourcePath);
    const dest = this.normalizePath(destPath);
    const bucket = this.getBucket();
    await bucket.file(src).copy(bucket.file(dest));
    console.log(`[GCPStorage] Copiado: ${src} → ${dest}`);
  }
}

export default GCPStorageService;
