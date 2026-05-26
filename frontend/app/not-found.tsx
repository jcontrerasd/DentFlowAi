import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Fondo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-surface-2 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-hl blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md text-center relative z-10 bg-surface shadow-sm border border-divider p-12 rounded-[2.5rem] border border-divider">
        <p className="text-8xl font-black text-primary/20 mb-4 select-none">404</p>
        <h1 className="text-3xl serif-font text-foreground mb-4 uppercase">
          Página No Encontrada
        </h1>
        <p className="text-muted leading-relaxed mb-10">
          La ruta que buscas no existe o fue movida. Verifica la URL o regresa al inicio.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-surface text-foreground font-bold rounded-xl shadow-xl shadow-sm hover:opacity-90 transition-opacity uppercase tracking-widest text-[11px]"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
