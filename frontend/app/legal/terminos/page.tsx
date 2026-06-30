import Link from 'next/link';
import AuthNavbar from '@/components/auth/AuthNavbar';

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-surface pt-32 pb-20 px-6">
      <AuthNavbar />
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl serif-font italic mb-2 text-foreground">Términos de Uso.</h1>
          <p className="text-faint text-xs">Última actualización: junio de 2026.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">¿Qué es DentFlowAi?</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            DentFlowAi es una plataforma marketplace que conecta dentistas con laboratorios técnicos para el{' '}
            <span className="font-bold text-foreground">diseño digital CAD</span> de prótesis dentales: el dentista sube
            escaneos 3D y el laboratorio entrega el diseño digital correspondiente. El motor Fauchard asigna
            automáticamente cada caso publicado al laboratorio más adecuado según disponibilidad, especialidad y
            desempeño histórico. La plataforma no fabrica ni envía piezas físicas — su alcance es exclusivamente el
            servicio de diseño (CAD).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Rol de cada parte</h2>
          <ul className="space-y-2 text-sm text-muted leading-relaxed list-disc pl-5 text-justify">
            <li><span className="font-bold text-foreground">Dentista</span>: publica casos con los datos clínicos y escaneos necesarios, y es responsable de haber obtenido el consentimiento del paciente antes de subir su información.</li>
            <li><span className="font-bold text-foreground">Técnico / laboratorio CAD</span>: recibe asignaciones, las acepta o rechaza, y entrega el diseño digital (CAD) dentro del plazo comprometido. No realiza fabricación física como parte del servicio activo de la plataforma.</li>
            <li><span className="font-bold text-foreground">DentFlowAi (Fauchard)</span>: actúa como intermediario tecnológico — no presta atención clínica ni fabrica directamente, solo orquesta la asignación y el flujo de trabajo entre las partes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Cuentas</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            Cada usuario es responsable de mantener la confidencialidad de sus credenciales. Las cuentas se vinculan a una
            organización (clínica o laboratorio). El uso de la plataforma requiere aceptar el marco legal vigente durante
            el registro.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Uso aceptable</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            No está permitido compartir datos de contacto fuera de los canales de la plataforma para evadir el marketplace,
            ni subir información que no corresponda al caso clínico. Los campos de texto libre están sujetos a moderación
            automática (ContactGuard).
          </p>
        </section>

        <Link href="/" className="inline-block text-sm font-bold text-primary hover:underline underline-offset-4">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}
