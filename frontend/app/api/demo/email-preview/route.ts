import { NextRequest, NextResponse } from 'next/server';
import { getEmailPreviewsSince, isEmailPreviewEnabled } from '@/lib/services/emailPreviewBuffer';

export const dynamic = 'force-dynamic';

/**
 * DEMO (temporal): devuelve los previews de email registrados con `ts > since`.
 * Gated por NEXT_PUBLIC_DEMO_EMAIL_PREVIEW (si off, responde lista vacía). Solo lectura.
 */
export async function GET(req: NextRequest) {
  if (!isEmailPreviewEnabled()) {
    return NextResponse.json({ enabled: false, emails: [] });
  }
  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam ? Number(sinceParam) : 0;
  const emails = getEmailPreviewsSince(Number.isFinite(since) ? since : 0);
  return NextResponse.json({ enabled: true, emails });
}
