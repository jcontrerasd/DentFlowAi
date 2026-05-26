import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type TelemetryPayload = {
  app: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  timestamp: string;
  path?: string;
  userAgent?: string;
  context?: Record<string, JsonValue>;
  error?: Record<string, JsonValue>;
};

type RateEntry = { count: number; windowStart: number };

const MAX_BODY_CHARS = 16_000;
const MAX_FIELD_CHARS = 1_000;
const ALLOWED_LEVELS = new Set(['error', 'warn', 'info']);
const WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 60;

const RATE_LIMIT = Number.parseInt(process.env.TELEMETRY_RATE_LIMIT_PER_MINUTE ?? '', 10) || DEFAULT_RATE_LIMIT;
const TOKEN = process.env.TELEMETRY_INGEST_TOKEN ?? '';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const ORIGIN_ALLOWLIST = (process.env.TELEMETRY_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const rateStore = new Map<string, RateEntry>();

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_REGEX = /bearer\s+[A-Z0-9._~+\/-]+/gi;
const FIREBASE_KEY_REGEX = /AIza[0-9A-Za-z\-_]{35}/g;
const PRIVATE_KEY_REGEX = /-----BEGIN[\s\S]+?PRIVATE KEY-----[\s\S]+?-----END[\s\S]+?PRIVATE KEY-----/gi;
const SENSITIVE_KEY_REGEX = /(password|token|secret|authorization|cookie|session|api[_-]?key|private[_-]?key)/i;

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function enforceRateLimit(key: string): boolean {
  const now = Date.now();
  const existing = rateStore.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    rateStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= RATE_LIMIT) return false;
  existing.count += 1;
  rateStore.set(key, existing);
  return true;
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return '';
  }
}

function isAllowedOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (ORIGIN_ALLOWLIST.length > 0) {
    return ORIGIN_ALLOWLIST.some((allowed) => normalizeOrigin(allowed) === normalized);
  }
  return true;
}

function computeSignature(timestamp: string, body: string, token: string): string {
  return createHash('sha256').update(`${timestamp}.${body}.${token}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function clampString(value: string, max = MAX_FIELD_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...[truncated]`;
}

function redactString(input: string): string {
  return clampString(
    input
      .replace(PRIVATE_KEY_REGEX, '[REDACTED_PRIVATE_KEY]')
      .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
      .replace(FIREBASE_KEY_REGEX, '[REDACTED_FIREBASE_KEY]')
      .replace(EMAIL_REGEX, '[REDACTED_EMAIL]'),
  );
}

function redactJson(value: unknown, keyHint = ''): JsonValue {
  if (value == null) return null;

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_REGEX.test(keyHint)) return '[REDACTED]';
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactJson(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(0, 100);
    const redacted: Record<string, JsonValue> = {};
    for (const [key, entryValue] of entries) {
      redacted[key] = redactJson(entryValue, key);
    }
    return redacted;
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  return redactJson(value) as Record<string, JsonValue>;
}

function validatePayload(input: unknown): TelemetryPayload | null {
  if (!isRecord(input)) return null;

  const app = typeof input.app === 'string' ? clampString(input.app, 64) : '';
  const levelRaw = typeof input.level === 'string' ? input.level.toLowerCase() : '';
  const message = typeof input.message === 'string' ? clampString(input.message, 500) : '';
  const timestamp = typeof input.timestamp === 'string' ? input.timestamp : '';

  if (!app || !message || !timestamp || !ALLOWED_LEVELS.has(levelRaw)) return null;
  if (Number.isNaN(Date.parse(timestamp))) return null;

  return {
    app,
    level: levelRaw as TelemetryPayload['level'],
    message,
    timestamp,
    path: typeof input.path === 'string' ? clampString(input.path, 512) : undefined,
    userAgent: typeof input.userAgent === 'string' ? clampString(input.userAgent, 512) : undefined,
    context: asObject(input.context),
    error: asObject(input.error),
  };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  const referer = req.headers.get('referer') ?? '';
  const secFetchSite = (req.headers.get('sec-fetch-site') ?? '').toLowerCase();

  if (origin) {
    if (!isAllowedOrigin(origin)) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
  } else if (referer) {
    const refererOrigin = normalizeOrigin(referer);
    if (!refererOrigin || !isAllowedOrigin(refererOrigin)) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
  }

  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site') {
    return NextResponse.json({ error: 'forbidden_context' }, { status: 403 });
  }

  const ip = getClientIp(req);
  if (!enforceRateLimit(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const signature = req.headers.get('x-telemetry-signature') ?? '';
  if (TOKEN && signature) {
    const timestamp = req.headers.get('x-telemetry-timestamp') ?? '';

    const timestampMs = Number.parseInt(timestamp, 10);
    const now = Date.now();
    const isTimestampValid = Number.isFinite(timestampMs) && Math.abs(now - timestampMs) <= TIMESTAMP_TOLERANCE_MS;

    if (!signature || !isTimestampValid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const expected = computeSignature(timestamp, rawBody, TOKEN);
    if (!safeEqualHex(signature, expected)) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const payload = validatePayload(parsed);
  if (!payload) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 422 });
  }

  // Logging de servidor con datos ya normalizados y redactados.
  console.error('[DentFlowAi Telemetry]', payload);

  return NextResponse.json({ ok: true }, { status: 202 });
}