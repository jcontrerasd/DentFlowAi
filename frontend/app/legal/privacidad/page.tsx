import Link from 'next/link';
import AuthNavbar from '@/components/auth/AuthNavbar';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-surface pt-32 pb-20 px-6">
      <AuthNavbar />
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl serif-font italic mb-2 text-foreground">Política de Privacidad.</h1>
          <p className="text-faint text-xs">Última actualización: junio de 2026.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">¿Qué datos recolectamos?</h2>
          <ul className="space-y-2 text-sm text-muted leading-relaxed list-disc pl-5 text-justify">
            <li>Datos de perfil: nombre, email, teléfono, especialidad y, si aplica, datos de tu organización (RUT, giro, dirección legal).</li>
            <li>Dirección geográfica: país, región, comuna y dirección de calle (dentistas y técnicos).</li>
            <li>Datos clínicos del caso que el dentista publica: escaneos 3D dentales, notas clínicas y un identificador anónimo del paciente — nunca su nombre ni RUT.</li>
            <li>Eventos de actividad dentro de la plataforma (historial de cada caso, calificaciones).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">¿Para qué los usamos?</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            Usamos tus datos para las siguientes finalidades, todas amparadas por la Ley 21.719 y la Ley 19.628:
          </p>
          <ul className="space-y-2 text-sm text-muted leading-relaxed list-disc pl-5 text-justify">
            <li>
              <span className="font-bold text-foreground">Operar el marketplace</span>: identificarte al iniciar sesión,
              asignar casos a través del motor Fauchard, permitir la comunicación entre dentista y laboratorio dentro de
              cada caso, y enviarte notificaciones operativas sobre tus casos.
            </li>
            <li>
              <span className="font-bold text-foreground">Estadísticas y analítica de la plataforma</span>: medimos
              indicadores como tiempos de respuesta, tasas de aceptación, desempeño por categoría de trabajo y uso general
              del servicio. Para esto usamos datos <span className="font-bold text-foreground">agregados o anonimizados</span> —
              nunca la identidad del paciente, ni el contenido clínico de un caso (escaneos, notas, identificador del paciente) de forma
              individualizable.
            </li>
            <li>
              <span className="font-bold text-foreground">Seguridad y prevención de fraude/abuso</span>: detectar intentos de
              contacto fuera de la plataforma (ContactGuard), accesos indebidos y comportamiento anómalo.
            </li>
            <li>
              <span className="font-bold text-foreground">Cumplimiento de obligaciones legales</span>: conservar registros
              de auditoría y de actividad cuando una ley o autoridad competente lo exige.
            </li>
            <li>
              <span className="font-bold text-foreground">Mejora del producto</span>: evaluar y ajustar el algoritmo
              Fauchard y la experiencia de uso, en base a métricas agregadas de uso real de la plataforma.
            </li>
          </ul>
          <p className="text-sm text-muted leading-relaxed text-justify">
            No vendemos ni cedemos tus datos a terceros con fines comerciales. No se usan tus datos para finalidades
            distintas a las aquí enumeradas sin informarte primero.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">¿Con quién se comparten?</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            Los datos de un caso solo son visibles para el dentista que lo publicó y el laboratorio que tiene la asignación
            activa. Ningún otro técnico del pool puede ver el contenido del caso. El dentista nunca ve la identidad del
            laboratorio asignado, ni viceversa, salvo en los pasos del flujo donde corresponde. El equipo administrador de
            DentFlowAi puede acceder a los datos solo con fines de soporte y operación de la plataforma.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Marco legal aplicable</h2>
          <ul className="space-y-3 text-sm text-muted leading-relaxed text-justify">
            <li>
              <span className="font-bold text-foreground">Ley 21.719</span> — Protección de datos personales. Exige
              consentimiento explícito para tratar datos sensibles, como los escaneos 3D y datos de salud, y otorga
              derechos de acceso, rectificación, cancelación, oposición y portabilidad sobre tus datos.
            </li>
            <li>
              <span className="font-bold text-foreground">Ley 19.628</span> — Protección de la vida privada. Regula los
              datos personales básicos (nombre, contacto, dirección) que la plataforma almacena para operar tu cuenta.
            </li>
            <li>
              <span className="font-bold text-foreground">Ley 20.584</span> — Derechos y deberes de los pacientes.
              Protege la confidencialidad de la información clínica de los pacientes en los casos que el dentista gestiona
              en la plataforma.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Tus derechos</h2>
          <p className="text-sm text-muted leading-relaxed text-justify">
            Puedes acceder y descargar una copia de tus datos personales desde tu perfil (sección &quot;Mis datos&quot;), y
            solicitar la eliminación de tu cuenta desde la misma página. Si tu cuenta tiene actividad asociada (casos,
            calificaciones), la cuenta se desactiva y los datos se retienen por motivos de integridad histórica, sujeto a
            revisión.
          </p>
        </section>

        <Link href="/" className="inline-block text-sm font-bold text-primary hover:underline underline-offset-4">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}
