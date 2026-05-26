import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Activity, Users, ShieldCheck, Zap } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  return (
    <div className="flex flex-col min-h-screen selection:bg-teal-500/30">
      {/* Navbar con Glassmorphism */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 glass-effect m-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-teal flex items-center justify-center">
            <Activity className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">DentFlowAi</span>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-sm font-medium hover:text-primary transition-colors">
            Iniciar Sesión
          </Link>
          <Link href="/auth/register" className="px-4 py-2 text-sm font-medium text-white gradient-teal rounded-xl shadow-lg shadow-teal-500/20 hover:scale-105 transition-transform">
            Registro Gratis
          </Link>
        </div>
      </nav>

      <main className="flex-grow pt-28">
        {/* Section Hero */}
        <section className="px-6 py-12 lg:py-24 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 overflow-hidden">
          <div className="flex-1 text-center lg:text-left space-y-6 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-primary text-xs font-semibold tracking-wider uppercase">
              <Zap className="w-3 h-3" />
              Revolucionando el flujo dental
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold leading-tight balance">
              Conectando el <span className="text-primary underline decoration-teal-500/30 underline-offset-8">Flujo Digital</span> de la Odontología
            </h1>
            <p className="text-lg text-secondary max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              La plataforma SaaS B2B que conecta clínicas con los mejores técnicos dentales. 
              Estandariza tu flujo CAD, reduce tiempos de entrega y garantiza resultados clínicos excepcionales.
            </p>
          </div>

          <div className="flex-1 relative w-full aspect-square max-w-xl animate-fade-in [animation-delay:200ms]">
            <div className="absolute inset-0 bg-teal-500/20 blur-[100px] rounded-full" />
            <div className="relative z-10 w-full h-full rounded-3xl overflow-hidden glass-effect p-2 rotate-2 hover:rotate-0 transition-transform duration-700">
               <Image 
                src="/images/hero_dental.png" 
                alt="Prosthetic Design AI" 
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover rounded-2xl"
                priority
               />
            </div>
            {/* Badges de soporte (flotantes) */}
            <div className="absolute -bottom-6 -left-6 z-20 glass-effect p-4 rounded-2xl border border-teal-500/30 shadow-2xl animate-bounce [animation-duration:3s]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-teal flex items-center justify-center">
                  <ShieldCheck className="text-white w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-bold text-secondary uppercase tracking-widest">Escrow Activo</div>
                  <div className="text-sm font-black">Pagos 100% Seguros</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sección de Propuestas de Valor */}
        <section className="px-6 py-20 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="max-w-7xl mx-auto text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold">Un ecosistema para cada rol</h2>
            <p className="text-secondary">Diseñado para la precisión clínica y la eficiencia operativa.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Card Dentista */}
            <div className="p-10 rounded-3xl glass-effect border-t-4 border-t-primary space-y-6 hover:shadow-2xl transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Soy Dentista / Clínica</h3>
              <ul className="space-y-4 text-secondary">
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1 text-primary text-[10px] font-bold">✓</span>
                  Sube escaneos intraorales STL/OBJ en segundos.
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1 text-primary text-[10px] font-bold">✓</span>
                  Visor 3D en la nube para aprobaciones remotas.
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-1 text-primary text-[10px] font-bold">✓</span>
                  Historial clínico digital y mensajería directa.
                </li>
              </ul>
              <Link href="/auth/register" className="inline-flex items-center gap-2 font-bold text-primary group-hover:translate-x-1 transition-transform">
                Crear cuenta clínica <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Card Técnico */}
            <div className="p-10 rounded-3xl glass-effect border-t-4 border-t-zinc-400 space-y-6 hover:shadow-2xl transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-zinc-500/10 flex items-center justify-center text-zinc-500 group-hover:bg-zinc-800 group-hover:text-white transition-colors">
                <Activity className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Soy Laboratorio / Técnico</h3>
              <ul className="space-y-4 text-secondary">
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center mt-1 text-zinc-600 text-[10px] font-bold">✓</span>
                  Recibe casos globales con especificaciones claras.
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center mt-1 text-zinc-600 text-[10px] font-bold">✓</span>
                  Gestión segura de pagos mediante Escrow.
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center mt-1 text-zinc-600 text-[10px] font-bold">✓</span>
                  Tablero Kanban para organizar tu producción.
                </li>
              </ul>
              <Link href="/auth/register" className="inline-flex items-center gap-2 font-bold text-zinc-700 group-hover:translate-x-1 transition-transform">
                Registrar laboratorio <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-zinc-200 dark:border-zinc-800 max-w-7xl mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2 opacity-50">
          <Activity className="w-5 h-5" />
          <span className="font-bold tracking-tight">DentFlowAi</span>
        </div>
        <p className="text-sm text-zinc-500">© 2026 DentFlowAi. Todos los derechos reservados.</p>
        <div className="flex gap-6 text-sm text-zinc-500">
          <Link href="#" className="hover:text-primary transition-colors">Privacidad</Link>
          <Link href="#" className="hover:text-primary transition-colors">Términos</Link>
          <Link href="#" className="hover:text-primary transition-colors">Contacto</Link>
        </div>
      </footer>
    </div>
  );
}
