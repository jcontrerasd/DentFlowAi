type LogContext = Record<string, unknown>;

const isDevelopment = process.env.NODE_ENV !== 'production';
const logEndpoint = process.env.NEXT_PUBLIC_LOG_ENDPOINT || '/api/telemetry';

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    raw: error,
  };
};

const sendToEndpoint = async (payload: Record<string, unknown>) => {
  if (!logEndpoint || typeof window === 'undefined') return;

  void fetch(logEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Ignorar errores de telemetría para no afectar UX.
  });
};

export function logError(message: string, error?: unknown, context?: LogContext) {
  const payload = {
    app: 'DentFlowAi',
    level: 'error',
    message,
    error: typeof error !== 'undefined' ? normalizeError(error) : undefined,
    context,
    timestamp: new Date().toISOString(),
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  if (!isDevelopment) {
    void sendToEndpoint(payload);
  }

  if (context) {
    console.error(`[DentFlowAi] ${message}`, error, context);
    return;
  }

  if (typeof error !== 'undefined') {
    console.error(`[DentFlowAi] ${message}`, error);
    return;
  }

  console.error(`[DentFlowAi] ${message}`);
}