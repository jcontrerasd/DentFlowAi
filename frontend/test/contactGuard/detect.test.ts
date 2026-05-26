import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/contactGuard/cache', () => {
  const rules = [
    {
      id: 'r-email',
      type: 'regex' as const,
      name: 'email',
      pattern: '[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}',
      flags: 'ig',
      appliesToFields: null,
      compiled: /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi,
    },
    {
      id: 'r-phone',
      type: 'regex' as const,
      name: 'telefono_8plus_digitos',
      pattern: '(?<!\\d)(?:\\+?\\d{1,3}[\\s\\-\\.]?)?\\d{8,}(?!\\d)',
      flags: 'ig',
      appliesToFields: null,
      compiled: /(?<!\d)(?:\+?\d{1,3}[\s\-\.]?)?\d{8,}(?!\d)/g,
    },
    {
      id: 'r-url',
      type: 'regex' as const,
      name: 'url_http',
      pattern: 'https?://[^\\s]+',
      flags: 'ig',
      appliesToFields: null,
      compiled: /https?:\/\/[^\s]+/gi,
    },
    {
      id: 'r-wsp',
      type: 'keyword' as const,
      name: 'wsp',
      pattern: 'wsp',
      flags: 'i',
      appliesToFields: null,
    },
    {
      id: 'r-whatsapp',
      type: 'keyword' as const,
      name: 'whatsapp',
      pattern: 'whatsapp',
      flags: 'i',
      appliesToFields: null,
    },
  ];
  return {
    getGuardBucket: async () => ({
      rules,
      courierDomains: ['chilexpress.cl', 'starken.cl'],
      loadedAt: Date.now(),
    }),
    invalidateContactGuardCache: () => {},
  };
});

import { checkContactExposure } from '@/lib/contactGuard';

describe('checkContactExposure', () => {
  beforeEach(() => {});

  it('detecta email', async () => {
    const r = await checkContactExposure('contáctame en juan@mail.com', { field: 'techNotes' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.ruleName === 'email')).toBe(true);
  });

  it('detecta teléfono CL aunque venga con espacios', async () => {
    const r = await checkContactExposure('llámame +56 9 1234 5678', { field: 'techNotes' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.ruleName === 'telefono_8plus_digitos')).toBe(true);
  });

  it('detecta keyword whatsapp', async () => {
    const r = await checkContactExposure('escríbeme por whatsapp', { field: 'techNotes' });
    expect(r.ok).toBe(false);
  });

  it('detecta keyword wsp con leet', async () => {
    const r = await checkContactExposure('por wsp te paso info', { field: 'techNotes' });
    expect(r.ok).toBe(false);
  });

  it('no detecta texto clínico legítimo', async () => {
    const r = await checkContactExposure('Diente 2.6, color A2, oclusión clase I', { field: 'doctorNotes' });
    expect(r.ok).toBe(true);
  });

  it('permite URL de courier en allowlist cuando field=dispatchTracking', async () => {
    const r = await checkContactExposure('https://www.chilexpress.cl/seguimiento/123', {
      field: 'dispatchTracking',
      allowCourierUrls: true,
    });
    expect(r.ok).toBe(true);
  });

  it('bloquea URL externa en dispatchTracking aunque allowCourierUrls', async () => {
    const r = await checkContactExposure('https://bit.ly/xyz', {
      field: 'dispatchTracking',
      allowCourierUrls: true,
    });
    expect(r.ok).toBe(false);
  });

  it('bloquea URL externa en techNotes', async () => {
    const r = await checkContactExposure('mira https://midominio.com', { field: 'techNotes' });
    expect(r.ok).toBe(false);
  });

  it('texto vacío pasa', async () => {
    const r = await checkContactExposure('', { field: 'techNotes' });
    expect(r.ok).toBe(true);
  });
});
