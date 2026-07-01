/**
 * Transport EmailJS de notifications.ts (v5.0). Mockea fetch + db.
 * Verifica el payload a la API REST y el modo stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ email: 'tech@test.local', fullName: 'Tech Uno' }]),
        }),
      }),
    }),
  },
}));

import { notifyUser } from '@/lib/services/notifications';

const ENV_KEYS = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY', 'NOTIFICATIONS_LIVE', 'EMAIL_OVERRIDE_TO'] as const;

describe('notifyUser — transport EmailJS', () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    // Limpiar override de email para no afectar la dirección esperada del test
    delete process.env.EMAIL_OVERRIDE_TO;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('envía el payload correcto a la API REST de EmailJS', async () => {
    process.env.NOTIFICATIONS_LIVE = 'true';
    process.env.EMAILJS_SERVICE_ID = 'service_x';
    process.env.EMAILJS_TEMPLATE_ID = 'template_x';
    process.env.EMAILJS_PUBLIC_KEY = 'pub_x';
    process.env.EMAILJS_PRIVATE_KEY = 'priv_x';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const res = await notifyUser('u1', 'NUEVA_ASIGNACION', { caseId: 'c1', deadline: '12:00' });
    expect(res.success).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    const body = JSON.parse(init.body);
    expect(body.service_id).toBe('service_x');
    expect(body.template_id).toBe('template_x');
    expect(body.user_id).toBe('pub_x');
    expect(body.accessToken).toBe('priv_x');
    expect(body.template_params.to_email).toBe('tech@test.local');
    expect(typeof body.template_params.subject).toBe('string');
    expect(typeof body.template_params.body).toBe('string');
  });

  it('modo stub: no llama a fetch cuando faltan credenciales', async () => {
    delete process.env.EMAILJS_SERVICE_ID;
    process.env.EMAILJS_TEMPLATE_ID = 'template_x';
    process.env.EMAILJS_PUBLIC_KEY = 'pub_x';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await notifyUser('u1', 'NIVEL_3_AUTO_OFF', { count: 3 });
    expect(res.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propaga el error cuando EmailJS responde no-ok', async () => {
    process.env.NOTIFICATIONS_LIVE = 'true';
    process.env.EMAILJS_SERVICE_ID = 'service_x';
    process.env.EMAILJS_TEMPLATE_ID = 'template_x';
    process.env.EMAILJS_PUBLIC_KEY = 'pub_x';
    process.env.EMAILJS_PRIVATE_KEY = 'priv_x';

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' });
    vi.stubGlobal('fetch', fetchMock);

    const res = await notifyUser('u1', 'PERDON_ADMIN', { count: 1, level: 1 });
    expect(res.success).toBe(false);
  });

  it('guard de ambiente: con credenciales pero NOTIFICATIONS_LIVE!=true → NO envía (stub)', async () => {
    delete process.env.NOTIFICATIONS_LIVE; // no "live"
    process.env.EMAILJS_SERVICE_ID = 'service_x';
    process.env.EMAILJS_TEMPLATE_ID = 'template_x';
    process.env.EMAILJS_PUBLIC_KEY = 'pub_x';
    process.env.EMAILJS_PRIVATE_KEY = 'priv_x';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await notifyUser('u1', 'NUEVA_ASIGNACION', { caseId: 'c1', deadline: '12:00' });
    expect(res.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // aunque haya credenciales válidas
  });
});
