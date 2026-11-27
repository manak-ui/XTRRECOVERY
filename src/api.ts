import type { BanInfo } from './types';

let inMemoryToken: string | null = null;
let onBannedCallback: ((info: BanInfo) => void) | null = null;

const DEVICE_ID_STORAGE_KEY = 'kwg_device_id';

export function getClientDeviceId(): string {
  try {
    let existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'browser-device';
  }
}

export function getClientDeviceFingerprint(): string {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const scr = typeof screen !== 'undefined' ? screen : null;
    const tz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        : '';
    const raw = [
      nav?.platform || '',
      nav?.language || '',
      nav?.hardwareConcurrency || 0,
      nav?.maxTouchPoints || 0,
      scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : '',
      tz,
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fp-${Math.abs(hash).toString(36)}`;
  } catch {
    return '';
  }
}

export function normalizeTelegramSupportUrl(raw: string | null | undefined): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  const cleanHandle = val.replace(/^@+/, '').replace(/^t\.me\//i, '').trim();
  if (!cleanHandle) return '';
  return `https://t.me/${cleanHandle}`;
}

export function getTelegramDisplayHandle(raw: string | null | undefined): string {
  const val = String(raw || '').trim();
  if (!val) return '@animetraderss';
  if (val.startsWith('@')) return val;
  try {
    const parsed = new URL(val);
    if (parsed.hostname.toLowerCase().includes('t.me')) {
      const slug = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (slug) return `@${slug}`;
    }
  } catch {
    // ignore
  }
  return val;
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setOnBannedHandler(handler: ((info: BanInfo) => void) | null) {
  onBannedCallback = handler;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  headers.set('X-Device-Id', getClientDeviceId());
  const fp = getClientDeviceFingerprint();
  if (fp) {
    headers.set('X-Device-Fingerprint', fp);
  }

  const method = String(options.method || 'GET').toUpperCase();
  const isAiPredict = url.startsWith('/api/wingo/ai-predict');
  const isIdempotentEndpoint =
    method === 'GET' ||
    method === 'HEAD' ||
    (url.startsWith('/api/wingo/') && !isAiPredict) ||
    url.startsWith('/api/deposits/qr');

  let res!: Response;
  let text = '';
  let data: Record<string, unknown> = {};
  let jsonParseFailed = false;

  const maxAttempts = isIdempotentEndpoint ? 2 : 1;
  const timeoutMs = isAiPredict ? 34000 : 16000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers,
        signal: options.signal || controller.signal,
      });
    } catch (fetchErr) {
      window.clearTimeout(timeoutId);
      if (attempt + 1 < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        continue;
      }
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError');
      throw new ApiError(
        isTimeout
          ? 'Server request timed out. Please try again.'
          : 'Network connection interrupted. Please check your connection and try again.',
        503,
        {}
      );
    }
    window.clearTimeout(timeoutId);

    text = await res.text();
    data = {};
    jsonParseFailed = false;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      jsonParseFailed = true;
      data = { error: 'Server is temporarily busy. Please try again.' };
    }

    const isTransientHtml =
      jsonParseFailed && (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 200);
    if (isTransientHtml && attempt + 1 < maxAttempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      continue;
    }
    break;
  }

  if (!res.ok || jsonParseFailed) {
    if (res.status === 403 && data.banned && onBannedCallback) {
      onBannedCallback({
        banReason: String(data.banReason || 'Account Suspended'),
        banNotice: String(data.banNotice || 'Your account has been suspended by an administrator.'),
        bannedAt: (data.bannedAt as string) || null,
        banExpiresAt: (data.banExpiresAt as string) || null,
      });
    }
    let errorMessage = String(data.error || `Request failed (${res.status})`);
    if (jsonParseFailed) {
      if (res.status === 413) {
        errorMessage = 'Uploaded payload is too large. Please use a smaller file or image.';
      } else {
        errorMessage = 'Server connection refreshed briefly. Please try again.';
      }
    }
    throw new ApiError(errorMessage, res.status || 500, data);
  }

  return data as T;
}

export function formatCurrency(amount: number): string {
  const num = Number(amount || 0);
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
