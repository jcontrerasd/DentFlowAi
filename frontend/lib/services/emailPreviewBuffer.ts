/**
 * Buffer EN MEMORIA de previews de email para la DEMO local (temporal).
 *
 * Cuando `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW === 'true'`, `notifyUser` registra aquí el
 * correo que *se enviaría* (sin enviarlo). El cliente lo lee vía
 * `GET /api/demo/email-preview` y lo muestra en un modal. Es un ring buffer de proceso
 * único (suficiente para `npm run dev` local); no persiste ni escala a multi-proceso.
 *
 * Para retirar esta funcionalidad basta apagar el flag (default off).
 */

export type EmailPreview = {
  id: string;
  ts: number;
  to: string;
  subject: string;
  body: string;
  type: string;
};

const MAX = 50;

// globalThis persists across module instances (Turbopack isolates Server Actions
// and API routes in separate module contexts — a plain const buffer would be empty
// on the API route side even after notifyUser pushes to it).
declare global {
  // eslint-disable-next-line no-var
  var __emailPreviewBuffer: EmailPreview[] | undefined;
  // eslint-disable-next-line no-var
  var __emailPreviewSeq: number | undefined;
}
if (!globalThis.__emailPreviewBuffer) globalThis.__emailPreviewBuffer = [];
if (globalThis.__emailPreviewSeq === undefined) globalThis.__emailPreviewSeq = 0;

const buffer = globalThis.__emailPreviewBuffer;

export function isEmailPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_EMAIL_PREVIEW === 'true';
}

export function pushEmailPreview(email: Omit<EmailPreview, 'id' | 'ts'>): void {
  if (!isEmailPreviewEnabled()) return;
  const entry: EmailPreview = { ...email, id: `${Date.now()}-${++globalThis.__emailPreviewSeq!}`, ts: Date.now() };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
}

/** Devuelve los emails registrados con `ts > since` (orden cronológico). */
export function getEmailPreviewsSince(since: number): EmailPreview[] {
  if (!since) return buffer.slice();
  return buffer.filter((e) => e.ts > since);
}
