import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import { Providers } from './Providers';
import ClientTelemetry from '@/app/ClientTelemetry';
import { auth } from '@/auth';
import './theme.css';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "DentFlowAi | Colaboración Dental de Alta Precisión",
  description: "Plataforma SaaS para la gestión de casos odontológicos y colaboración con servicios de diseño 3D.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="es" className={`${inter.variable} ${instrumentSerif.variable} dark`}>
      <body className="antialiased selection:bg-teal-500/30 font-sans">
        {/* Escudo de Consola: Silencia errores basura de extensiones de Chrome en desarrollo */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  const ignoreStrings = [
                    'extension',
                    'lastError',
                    'message port closed',
                    'established connection',
                    'FrameDoesNotExistError',
                    'message channel is closed',
                    'THREE.Clock',
                    'deprecated'
                  ];
                  const originalError = console.error;
                  const originalWarn = console.warn;
                  
                  console.error = function(...args) {
                    const msg = args.join(' ');
                    if (ignoreStrings.some(str => msg.includes(str))) return;
                    originalError.apply(console, args);
                  };
                  
                  console.warn = function(...args) {
                    const msg = args.join(' ');
                    if (ignoreStrings.some(str => msg.includes(str))) return;
                    originalWarn.apply(console, args);
                  };
                })();
              `,
            }}
          />
        )}
        <Providers session={session}>
          <ClientTelemetry />
          {children}
        </Providers>
      </body>
    </html>
  );
}
