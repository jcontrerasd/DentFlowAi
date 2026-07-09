export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import { getCaseTraceAction } from '@/lib/db/actions/caseTrace';
import CaseTraceView from '@/components/admin/case-trace/CaseTraceView';
import { Search, History } from 'lucide-react';

export const metadata = {
  title: 'Traza de caso | Admin DentFlow',
};

export default async function AdminCaseTracePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const identity = await getServerIdentity();
  if (!identity || (identity.role !== 'admin' && !identity.isSystemAdmin)) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const code = sp.code?.trim();
  const result = code ? await getCaseTraceAction(code) : null;

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8 max-w-[1200px] mx-auto">
      <Header />

      <form action="/dashboard/admin/case-trace" method="GET" className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            name="code"
            defaultValue={code ?? ''}
            placeholder="DF-1234"
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface/60 border border-divider text-foreground text-sm font-medium placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 rounded-2xl bg-primary text-white text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
        >
          Buscar
        </button>
      </form>

      {result && !result.success && (
        <div className="p-6 rounded-2xl bg-error-hl border border-error/30 text-error text-sm font-medium">
          {result.error}
        </div>
      )}

      {result && result.success && <CaseTraceView trace={result.trace} />}
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
        <History className="w-5 h-5" />
      </div>
      <div>
        <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">Traza de Caso</h1>
        <p className="text-faint text-sm font-medium">Historial completo de estados, asignaciones y configuración Fauchard, sin anonimizar.</p>
      </div>
    </header>
  );
}
