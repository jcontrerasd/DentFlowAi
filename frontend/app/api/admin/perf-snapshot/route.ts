import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPerfStats, getPerfSamples } from '@/lib/perfBuffer';

/**
 * GET /api/admin/perf-snapshot
 * Devuelve estadísticas de latencia (P50/P95/P99) y los últimos 100 samples del ring buffer.
 * Solo accesible por admins.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const stats = getPerfStats();
  const recentSamples = getPerfSamples().slice(-100).reverse();

  return NextResponse.json({ stats, recentSamples, capturedAt: new Date().toISOString() });
}
