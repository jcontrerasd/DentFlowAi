import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Fondo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/5 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md text-center relative z-10 glass-effect p-12 rounded-[2.5rem] border border-white/5">
        <p className="text-8xl font-black text-teal-500/20 mb-4 select-none">404</p>
        <h1 className="text-3xl serif-font text-white mb-4 uppercase">
          Página No Encontrada
        </h1>
        <p className="text-slate-400 leading-relaxed mb-10">
          La ruta que buscas no existe o fue movida. Verifica la URL o regresa al inicio.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-3.5 gradient-teal text-white font-bold rounded-xl shadow-xl shadow-teal-900/20 hover:opacity-90 transition-opacity uppercase tracking-widest text-[11px]"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}
