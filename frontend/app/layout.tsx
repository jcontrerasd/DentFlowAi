import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Inter, Instrument_Serif } from 'next/font/google';
import { Providers } from './Providers';
import ClientTelemetry from '@/app/ClientTelemetry';
import { auth } from '@/auth';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import type { ThemeMode } from '@/lib/db/actions/userPreferences';
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

const THEME_COOKIE = 'dfa-theme';

function isValidMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const jar = await cookies();
  const raw = jar.get(THEME_COOKIE)?.value;
  const themePref: ThemeMode = isValidMode(raw) ? raw : 'system';

  // Script anti-FOUC: aplica la clase ('light' o 'dark') al <html> ANTES del primer paint.
  // Para modo 'system' resuelve contra matchMedia. Pesa ~150 bytes.
  const themeBootstrap = `(function(){try{var p='${themePref}';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

  return (
    <html
      lang="es"
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="antialiased selection:bg-primary/25 font-sans">
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
        <ThemeProvider initial={themePref}>
          <Providers session={session}>
            <ClientTelemetry />
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
