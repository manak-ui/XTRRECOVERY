import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  db,
  generateUid,
  getPlatformSettingsRow,
  hashSecret,
  logActivity,
  normalizePhone,
  nowIso,
  restoreDefaultKwgGame,
  roundMoney,
  verifySecret,
} from './server/db.ts';
import { ADMIN_PHONE, PREFILLED_BAN_NOTICES } from './server/constants.ts';
import { compileGameDocument } from './server/kwgDefaultGame.ts';
import type { PredictorMode } from './src/types.ts';
import {
  normalizeStrategyConfig,
  runCombinedWingoEngine,
} from './src/utils/wingoStrategies.ts';

interface DbUser {
  id: number;
  uid: string;
  username: string;
  phone: string;
  email: string;
  password_hash: string;
  game_pin_hash: string | null;
  wallet_balance: number;
  status: 'active' | 'banned';
  ban_reason: string | null;
  ban_notice: string | null;
  banned_at: string | null;
  ban_expires_at?: string | null;
  number_pred_expires_at: string | null;
  color_pred_expires_at: string | null;
  ai_pred_expires_at: string | null;
  device_id?: string;
  device_fp?: string;
  device_ban_exempt?: number;
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: DbUser;
  authToken?: string;
}

function isUserAiPassActive(user: DbUser, nowMs = Date.now()): boolean {
  if (user.status !== 'active') return false;
  if (user.phone === ADMIN_PHONE) return true;
  if (!user.ai_pred_expires_at) return false;
  const ms = Date.parse(user.ai_pred_expires_at);
  return !Number.isNaN(ms) && ms > nowMs;
}

function serializeUser(user: DbUser) {
  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    phone: user.phone,
    email: user.email,
    walletBalance: roundMoney(user.wallet_balance),
    isAdmin: user.phone === ADMIN_PHONE && user.status === 'active',
    status: user.status,
    banReason: user.ban_reason,
    banNotice: user.ban_notice,
    bannedAt: user.banned_at,
    banExpiresAt: user.ban_expires_at || null,
    numberPredExpiresAt: user.number_pred_expires_at || null,
    colorPredExpiresAt: user.color_pred_expires_at || null,
    aiPredExpiresAt: user.ai_pred_expires_at || null,
    aiPassActive: isUserAiPassActive(user),
    deviceId: user.device_id || '',
    createdAt: user.created_at,
  };
}

const SESSION_COOKIE_NAME = 'kwg_session';
// Sessions never expire unless user logs out or is banned/deleted
const SESSION_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SEC = 315360000;

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const attrs = isHttpsRequest(req)
    ? `Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=None; Partitioned`
    : `Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs}`);
}

function clearSessionCookie(req: Request, res: Response) {
  const attrs = isHttpsRequest(req)
    ? 'Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned'
    : 'Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; ${attrs}`);
}

function getTokenFromCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const pairs = raw.split(';');
  for (const part of pairs) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim()) || null;
      } catch {
        return part.slice(idx + 1).trim() || null;
      }
    }
  }
  return null;
}

function getTokenFromRequest(req: Request): { token: string | null; viaCookie: boolean } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return { token, viaCookie: false };
  }
  const cookieToken = getTokenFromCookie(req);
  if (cookieToken) return { token: cookieToken, viaCookie: true };
  return { token: null, viaCookie: false };
}

function verifyCookieCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;

  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function getSessionUser(token: string): DbUser | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as DbUser | undefined;
  return row || null;
}

function autoExpireTimedBanIfNeeded(user: DbUser): DbUser {
  if (user.status !== 'banned' || !user.ban_expires_at) {
    return user;
  }
  const expMs = Date.parse(user.ban_expires_at);
  if (!Number.isNaN(expMs) && expMs <= Date.now()) {
    db.prepare(
      `UPDATE users SET status = 'active', ban_reason = NULL, ban_notice = NULL, banned_at = NULL, ban_expires_at = NULL WHERE id = ?`
    ).run(user.id);
    logActivity({
      userId: user.id,
      category: 'ban',
      title: 'Timed Ban Expired Automatically',
      details: 'Your temporary suspension duration elapsed and your account was restored.',
      status: 'Active',
    });
    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as DbUser;
  }
  return user;
}

function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    created,
    expires
  );
  return token;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const { token, viaCookie } = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (viaCookie && !verifyCookieCsrf(req)) {
    res.status(403).json({ error: 'Cross-site request rejected.' });
    return;
  }
  const rawUser = getSessionUser(token);
  if (!rawUser) {
    res.status(401).json({ error: 'Session invalid. Please log in again.' });
    return;
  }
  const user = autoExpireTimedBanIfNeeded(rawUser);
  if (user.status === 'banned') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    clearSessionCookie(req, res);
    res.status(403).json({
      error: user.ban_notice || 'Account suspended.',
      banned: true,
      banReason: user.ban_reason || 'Account Policy Violation',
      banNotice: user.ban_notice || 'Your account has been suspended by an administrator.',
      bannedAt: user.banned_at,
      banExpiresAt: user.ban_expires_at || null,
    });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.phone !== ADMIN_PHONE) {
      res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      return;
    }
    next();
  });
}

function requireActiveAiPass(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (!isUserAiPassActive(user)) {
    const expMs = user.ai_pred_expires_at ? Date.parse(user.ai_pred_expires_at) : 0;
    const expired = Boolean(user.ai_pred_expires_at) && !Number.isNaN(expMs) && expMs <= Date.now();
    const cfgForErr = serializePlatformConfig();
    res.status(403).json({
      error: expired
        ? 'Your AI PASS has expired. Renew your AI PASS membership to continue using Gemini AI.'
        : `AI PASS Required. Activate AI PASS (7 Days ₹${cfgForErr.aiWeeklyPrice} · 15 Days ₹${cfgForErr.ai15DaysPrice} · Monthly ₹${cfgForErr.aiMonthlyPrice} · Yearly ₹${cfgForErr.aiYearlyPrice}) to use Gemini AI.`,
      aiPassRequired: true,
      expired,
    });
    return;
  }
  next();
}

function sanitizeThumbnail(thumb: string | undefined): string {
  const val = String(thumb || '').trim();
  if (!val) return '/src/assets/images/arcade_vault_thumb_1795541885373.jpg';
  if (val.startsWith('/src/assets/')) return val;
  if (val.startsWith('data:image/') && !val.startsWith('data:image/svg+xml')) return val;
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return val;
    }
  } catch {
    // ignore invalid url
  }
  return '/src/assets/images/arcade_vault_thumb_1795541885373.jpg';
}

const VALID_MOD_THEMES = new Set([
  'cyber-cyan',
  'neon-green',
  'high-blue',
  'spectrum',
  'crimson-red',
  'red-blue',
  'royal-gold',
  'custom',
]);

function getDefaultThemeForSlug(slug: string): string {
  switch (slug) {
    case 'yaarwin':
      return 'neon-green';
    case 'tg-dream':
      return 'high-blue';
    case 'jai-club':
      return 'spectrum';
    case 'dm-play':
      return 'crimson-red';
    case 'khelv-888':
      return 'red-blue';
    case '9k-club':
      return 'royal-gold';
    default:
      return 'cyber-cyan';
  }
}

function sanitizeHexColor(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val : fallback;
}

function normalizeModMenuConfig(raw: unknown, slug = '') {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }

  const isPartner = ['yaarwin', 'tg-dream', 'jai-club', 'dm-play', 'khelv-888', '9k-club'].includes(slug);
  const rawMenuType = parsed.menuType;
  const menuType =
    rawMenuType === 'none' || rawMenuType === 'compact-hud' || rawMenuType === 'wingo-full'
      ? rawMenuType
      : 'wingo-full';

  const enabled =
    menuType === 'none'
      ? false
      : parsed.enabled === undefined
      ? true
      : Boolean(parsed.enabled);

  const rawTheme = String(parsed.themePreset || '');
  const themePreset = VALID_MOD_THEMES.has(rawTheme) ? rawTheme : getDefaultThemeForSlug(slug);

  const clockMode =
    parsed.clockMode === 'utc-partner-api' || (parsed.clockMode !== 'ist-standard' && isPartner)
      ? 'utc-partner-api'
      : 'ist-standard';

  return {
    enabled,
    menuType: enabled ? menuType : 'none',
    themePreset,
    customAccent: sanitizeHexColor(parsed.customAccent, '#00f2ff'),
    customSecondaryAccent: sanitizeHexColor(parsed.customSecondaryAccent, '#9d4edd'),
    customBadge: String(parsed.customBadge || '').trim().slice(0, 60),
    clockMode,
    showLevelSplit: parsed.showLevelSplit === undefined ? true : Boolean(parsed.showLevelSplit),
    showManualHistory:
      parsed.showManualHistory === undefined ? true : Boolean(parsed.showManualHistory),
    showColorNumberPred:
      parsed.showColorNumberPred === undefined ? true : Boolean(parsed.showColorNumberPred),
  };
}

function sanitizeEmbedUrl(raw: unknown): string | null {
  const val = String(raw || '').trim();
  if (!val) return null;
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSupportUrl(raw: unknown): string | null {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('@')) {
    const handle = val.slice(1).replace(/[^A-Za-z0-9_]/g, '');
    return handle ? `https://t.me/${handle}` : null;
  }
  if (/^(?:t\.me|telegram\.me)\/[A-Za-z0-9_]{3,}/i.test(val)) {
    return `https://${val}`;
  }
  if (/^[A-Za-z0-9_]{4,36}$/.test(val)) {
    return `https://t.me/${val}`;
  }
  return sanitizeEmbedUrl(val);
}

const DEVICE_BAN_REASON = 'Multiple Accounts Limit Exceeded (Max 2 Per Device)';
const DEVICE_BAN_NOTICE =
  'More than 2 accounts were created from this device. Extra accounts are automatically banned and cannot log in. Contact Telegram support if you need assistance.';

function extractDeviceIdentifiers(req: Request): { deviceId: string; deviceFp: string } {
  const rawId = String(req.headers['x-device-id'] || req.body?.deviceId || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  const rawFp = String(req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  return { deviceId: rawId, deviceFp: rawFp };
}

function findMatchingDeviceAccounts(
  deviceId: string,
  deviceFp: string,
  excludeUserId?: number
): DbUser[] {
  if (!deviceId && !deviceFp) return [];
  const clauses: string[] = [];
  const params: Array<string | number> = [ADMIN_PHONE];
  if (deviceId) {
    clauses.push("(device_id != '' AND device_id = ?)");
    params.push(deviceId);
  }
  if (deviceFp) {
    clauses.push("(device_fp != '' AND device_fp = ?)");
    params.push(deviceFp);
  }
  let sql = `SELECT * FROM users WHERE phone != ? AND (${clauses.join(' OR ')})`;
  if (excludeUserId !== undefined) {
    sql += ' AND id != ?';
    params.push(excludeUserId);
  }
  sql += ' ORDER BY id ASC';
  return db.prepare(sql).all(...params) as unknown as DbUser[];
}

function serializePlatformConfig() {
  const row = getPlatformSettingsRow();
  const mode =
    row.predictor_mode === 'trend-follow' || row.predictor_mode === 'contrarian'
      ? row.predictor_mode
      : 'pattern-ai';
  const strategyConfig = normalizeStrategyConfig(
    {
      patternBrainEnabled:
        row.strategy_pattern_enabled === undefined ? true : Boolean(row.strategy_pattern_enabled),
      momentumTrendEnabled: Boolean(row.strategy_momentum_enabled),
      dragonContrarianEnabled: Boolean(row.strategy_contrarian_enabled),
      allThreeStrategiesActive: Boolean(row.strategy_all_three_enabled),
    },
    mode
  );
  return {
    brandName: row.brand_name || 'KWG Arena',
    tagline: row.tagline || 'VIP Gaming Vault & Smart Wingo Predictor',
    announcementText: row.announcement_text || '',
    announcementEnabled: Boolean(row.announcement_enabled),
    supportUrl: row.support_url || 'https://t.me/animetraderss',
    registrationsEnabled: Boolean(row.registrations_enabled),
    maintenanceMode: Boolean(row.maintenance_mode),
    maintenanceMessage:
      row.maintenance_message || 'Platform maintenance is underway. Back online shortly.',
    welcomeBonus: roundMoney(row.welcome_bonus || 0),
    numberPredPrice: roundMoney(row.number_pred_price || 20),
    numberPredHours: Math.max(1, Math.round(row.number_pred_hours || 24)),
    numberPredEnabled: Boolean(row.number_pred_enabled),
    colorPredPrice: roundMoney(row.color_pred_price || 10),
    colorPredHours: Math.max(1, Math.round(row.color_pred_hours || 48)),
    colorPredEnabled: Boolean(row.color_pred_enabled),
    minUnlockHours: Math.max(1, Math.round(row.min_unlock_hours || 1)),
    maxUnlockHours: Math.max(1, Math.round(row.max_unlock_hours || 720)),
    aiWeeklyPrice: roundMoney(row.ai_weekly_price ?? 101),
    ai15DaysPrice: roundMoney(row.ai_15days_price ?? 250),
    aiMonthlyPrice: roundMoney(row.ai_monthly_price ?? 499),
    aiYearlyPrice: roundMoney(row.ai_yearly_price ?? 1199),
    aiPredEnabled: row.ai_pred_enabled === undefined ? true : Boolean(row.ai_pred_enabled),
    predictorMode: mode,
    strategyConfig,
    updatedAt: row.updated_at,
  };
}

function escapeHtmlText(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmbedWrapperHtml(title: string, url: string): string {
  const safeTitle = escapeHtmlText(title || 'Embedded Game');
  const safeUrl = escapeHtmlText(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${safeTitle}</title>
<style>html,body,#gameFrame{width:100%;height:100%;margin:0;padding:0;border:0;background:#050508;overflow:hidden;}</style>
</head>
<body>
<iframe id="gameFrame" src="${safeUrl}" allowfullscreen></iframe>
</body>
</html>`;
}

function getPeriodRange(period: string): { start: string; end: string; label: string } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'yesterday': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 1);
      const e = new Date(endOfToday);
      e.setDate(e.getDate() - 1);
      return { start: s.toISOString(), end: e.toISOString(), label: 'Yesterday' };
    }
    case 'weekly': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 6);
      return { start: s.toISOString(), end: endOfToday.toISOString(), label: 'Last 7 Days' };
    }
    case 'monthly': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: s.toISOString(), end: endOfToday.toISOString(), label: 'This Month' };
    }
    case 'yearly': {
      const s = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start: s.toISOString(), end: endOfToday.toISOString(), label: 'This Year' };
    }
    case 'today':
    default:
      return { start: startOfToday.toISOString(), end: endOfToday.toISOString(), label: 'Today' };
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/platform/config', (_req, res) => {
    res.json({ config: serializePlatformConfig() });
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const rawPhone = String(req.body?.phone || '');
      const phone = normalizePhone(rawPhone);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const usernameInput = String(req.body?.username || '').trim();

      if (!phone || phone.length < 10 || phone.length > 15) {
        res.status(400).json({ error: 'Enter a valid 10-digit phone number.' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      if (req.body?.acceptedTerms === false) {
        res.status(400).json({
          error: 'You must read and agree to the User Terms & Conditions before creating an account.',
        });
        return;
      }

      const platformCfg = serializePlatformConfig();
      if (!platformCfg.registrationsEnabled && phone !== ADMIN_PHONE) {
        res.status(403).json({
          error: 'New user registrations are currently paused by the administrator.',
        });
        return;
      }

      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (existingPhone) {
        res.status(409).json({ error: 'An account with this phone number already exists.' });
        return;
      }

      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        res.status(409).json({ error: 'An account with this email address already exists.' });
        return;
      }

      const uid = generateUid();
      const username = usernameInput || `Player_${uid}`;
      const passwordHash = hashSecret(password);
      const ts = nowIso();
      const bonus = roundMoney(platformCfg.welcomeBonus || 0);
      const { deviceId, deviceFp } = extractDeviceIdentifiers(req);

      const existingDeviceUsers =
        phone !== ADMIN_PHONE ? findMatchingDeviceAccounts(deviceId, deviceFp) : [];
      const activeDeviceUsers = existingDeviceUsers.filter(
        (u) => u.status === 'active' && !u.device_ban_exempt
      );
      const exceedsDeviceLimit =
        phone !== ADMIN_PHONE &&
        (existingDeviceUsers.length >= 2 || activeDeviceUsers.length >= 2);

      if (exceedsDeviceLimit) {
        const result = db
          .prepare(
            `INSERT INTO users (
              uid, username, phone, email, password_hash, wallet_balance, status,
              ban_reason, ban_notice, banned_at, device_id, device_fp, device_ban_exempt, created_at
            ) VALUES (?, ?, ?, ?, ?, 0, 'banned', ?, ?, ?, ?, ?, 0, ?)`
          )
          .run(
            uid,
            username,
            phone,
            email,
            passwordHash,
            DEVICE_BAN_REASON,
            DEVICE_BAN_NOTICE,
            ts,
            deviceId,
            deviceFp,
            ts
          );

        const userId = Number(result.lastInsertRowid);
        logActivity({
          userId,
          category: 'ban',
          title: `Auto-Banned · ${DEVICE_BAN_REASON}`,
          details: 'Automatic device protection: more than 2 accounts created from the same device.',
          adminNotice: DEVICE_BAN_NOTICE,
          status: 'Banned',
          createdAt: ts,
        });

        // Ensure any previously created unexempt excess accounts (>2nd) on this device are also banned
        const nonExemptOrdered = existingDeviceUsers.filter((u) => !u.device_ban_exempt);
        for (let i = 2; i < nonExemptOrdered.length; i += 1) {
          const extra = nonExemptOrdered[i];
          if (extra.status !== 'banned') {
            db.prepare(
              `UPDATE users SET status = 'banned', ban_reason = ?, ban_notice = ?, banned_at = ? WHERE id = ?`
            ).run(DEVICE_BAN_REASON, DEVICE_BAN_NOTICE, ts, extra.id);
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(extra.id);
            logActivity({
              userId: extra.id,
              category: 'ban',
              title: `Auto-Banned · ${DEVICE_BAN_REASON}`,
              details: 'Excess account restricted by device account limit (max 2 per device).',
              adminNotice: DEVICE_BAN_NOTICE,
              status: 'Banned',
              createdAt: ts,
            });
          }
        }

        res.status(403).json({
          error: DEVICE_BAN_NOTICE,
          banned: true,
          banReason: DEVICE_BAN_REASON,
          banNotice: DEVICE_BAN_NOTICE,
          bannedAt: ts,
        });
        return;
      }

      const freeAiTrialExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const result = db
        .prepare(
          `INSERT INTO users (
            uid, username, phone, email, password_hash, wallet_balance, status,
            ai_pred_expires_at, device_id, device_fp, device_ban_exempt, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 0, ?)`
        )
        .run(
          uid,
          username,
          phone,
          email,
          passwordHash,
          bonus > 0 ? bonus : 0,
          freeAiTrialExpiresAt,
          deviceId,
          deviceFp,
          ts
        );

      const userId = Number(result.lastInsertRowid);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;

      logActivity({
        userId,
        category: 'security',
        title: 'Account Registered',
        details: `Assigned UID ${uid} with phone ${phone}.`,
        status: 'Active',
        createdAt: ts,
      });

      logActivity({
        userId,
        category: 'game',
        title: 'Free 24h Gemini AI Pass Activated',
        details: `New user perk granted automatically until ${freeAiTrialExpiresAt}.`,
        status: 'Active',
        createdAt: ts,
      });

      if (bonus > 0) {
        const refId = `BON-${Date.now().toString().slice(-6)}`;
        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
           VALUES (?, 'admin_credit', ?, ?, ?, ?, ?)`
        ).run(userId, bonus, bonus, 'New Player Welcome Bonus', refId, ts);

        logActivity({
          userId,
          category: 'wallet',
          title: `Welcome Bonus Credited (+₹${bonus.toFixed(2)})`,
          details: `Automatic registration bonus credited (${refId}).`,
          amount: bonus,
          status: 'Completed',
          createdAt: ts,
        });
      }

      const token = createSession(userId);
      setSessionCookie(req, res, token);
      res.status(201).json({
        token,
        user: serializeUser(user),
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Unable to complete registration.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const phone = normalizePhone(String(req.body?.phone || ''));
      const password = String(req.body?.password || '');
      const { deviceId, deviceFp } = extractDeviceIdentifiers(req);

      if (!phone || !password) {
        res.status(400).json({ error: 'Phone number and password are required.' });
        return;
      }

      const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as DbUser | undefined;
      if (!user) {
        if (phone === ADMIN_PHONE) {
          res.status(404).json({
            error: 'Admin account (7986911808) is not registered yet. Please complete Create Account with phone 7986911808 to activate admin access.',
            needsAdminRegistration: true,
          });
          return;
        }
        res.status(401).json({ error: 'Invalid phone number or password.' });
        return;
      }

      if (!verifySecret(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid phone number or password.' });
        return;
      }

      const checkedUser = autoExpireTimedBanIfNeeded(user);
      if (checkedUser.status === 'banned') {
        res.status(403).json({
          error: checkedUser.ban_notice || 'Your account has been suspended.',
          banned: true,
          banReason: checkedUser.ban_reason || 'Policy Violation',
          banNotice: checkedUser.ban_notice || 'Your account has been suspended by an administrator.',
          bannedAt: checkedUser.banned_at,
          banExpiresAt: checkedUser.ban_expires_at || null,
        });
        return;
      }

      // Enforce max 2 non-admin accounts per device on login
      const checkDeviceId = deviceId || user.device_id || '';
      const checkDeviceFp = deviceFp || user.device_fp || '';
      if (phone !== ADMIN_PHONE && !user.device_ban_exempt && (checkDeviceId || checkDeviceFp)) {
        if ((!user.device_id && deviceId) || (!user.device_fp && deviceFp)) {
          db.prepare('UPDATE users SET device_id = ?, device_fp = ? WHERE id = ?').run(
            checkDeviceId,
            checkDeviceFp,
            user.id
          );
        }
        const otherAccounts = findMatchingDeviceAccounts(checkDeviceId, checkDeviceFp, user.id);
        const earlierAccounts = otherAccounts.filter((other) => other.id < user.id);
        if (earlierAccounts.length >= 2) {
          const ts = nowIso();
          db.prepare(
            `UPDATE users SET status = 'banned', ban_reason = ?, ban_notice = ?, banned_at = ? WHERE id = ?`
          ).run(DEVICE_BAN_REASON, DEVICE_BAN_NOTICE, ts, user.id);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
          logActivity({
            userId: user.id,
            category: 'ban',
            title: `Auto-Banned · ${DEVICE_BAN_REASON}`,
            details: 'Account login blocked: more than 2 accounts detected on this device.',
            adminNotice: DEVICE_BAN_NOTICE,
            status: 'Banned',
            createdAt: ts,
          });
          res.status(403).json({
            error: DEVICE_BAN_NOTICE,
            banned: true,
            banReason: DEVICE_BAN_REASON,
            banNotice: DEVICE_BAN_NOTICE,
            bannedAt: ts,
          });
          return;
        }
      }

      const token = createSession(user.id);
      setSessionCookie(req, res, token);
      logActivity({
        userId: user.id,
        category: 'security',
        title: 'Account Sign In',
        details: 'Successful login via phone and password.',
        status: 'Verified',
      });

      const refreshedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as DbUser;
      res.json({
        token,
        user: serializeUser(refreshedUser),
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Unable to sign in.' });
    }
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    const { token } = getTokenFromRequest(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    if (req.authToken) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiry, req.authToken);
      setSessionCookie(req, res, req.authToken);
    }
    res.json({ user: serializeUser(req.user!) });
  });

  app.get('/api/games', (req, res) => {
    const { token } = getTokenFromRequest(req);
    const user = token ? getSessionUser(token) : null;

    const games = db
      .prepare(
        `SELECT id, slug, name, title, description, thumbnail, pricing_type, price, billing_mode, game_mode, embed_url, mod_menu_config, is_default, created_at
         FROM games
         ORDER BY is_default DESC, id ASC`
      )
      .all() as Array<{
      id: number;
      slug: string;
      name: string;
      title: string;
      description: string;
      thumbnail: string;
      pricing_type: 'free' | 'paid';
      price: number;
      billing_mode: 'once' | 'per_play';
      game_mode: 'source' | 'embed';
      embed_url: string;
      mod_menu_config: string;
      is_default: number;
      created_at: string;
    }>;

    let unlockedIds = new Set<number>();
    if (user) {
      const rows = db
        .prepare('SELECT DISTINCT game_id FROM game_unlocks WHERE user_id = ?')
        .all(user.id) as Array<{ game_id: number }>;
      unlockedIds = new Set(rows.map((r) => r.game_id));
    }

    res.json({
      games: games.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        title: g.title,
        description: g.description,
        thumbnail: g.thumbnail,
        pricing_type: g.pricing_type,
        price: roundMoney(g.price),
        billing_mode: g.billing_mode,
        gameMode: g.game_mode === 'embed' ? 'embed' : 'source',
        embedUrl: g.embed_url || '',
        modMenuConfig: normalizeModMenuConfig(g.mod_menu_config, g.slug),
        isDefault: Boolean(g.is_default),
        isUnlocked: g.pricing_type === 'free' || (g.billing_mode === 'once' && unlockedIds.has(g.id)),
        created_at: g.created_at,
      })),
    });
  });

  app.post('/api/games/:id/access', requireAuth, (req: AuthedRequest, res) => {
    try {
      const gameId = Number(req.params.id);
      const user = req.user!;
      const platformCfg = serializePlatformConfig();
      if (platformCfg.maintenanceMode && user.phone !== ADMIN_PHONE) {
        res.status(423).json({ error: platformCfg.maintenanceMessage });
        return;
      }

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as
      | {
          id: number;
          slug: string;
          name: string;
          title: string;
          pricing_type: 'free' | 'paid';
          price: number;
          billing_mode: 'once' | 'per_play';
          html_code: string;
          css_code: string;
          js_code: string;
          game_mode: 'source' | 'embed';
          embed_url: string;
          mod_menu_config: string;
          is_default: number;
        }
      | undefined;

    if (!game) {
      res.status(404).json({ error: 'Game not found.' });
      return;
    }

    const price = roundMoney(game.price);
    let chargedAmount = 0;

    if (game.pricing_type === 'paid' && price > 0) {
      const alreadyUnlocked =
        game.billing_mode === 'once' &&
        Boolean(
          db
            .prepare('SELECT id FROM game_unlocks WHERE user_id = ? AND game_id = ? LIMIT 1')
            .get(user.id, game.id)
        );

      if (!alreadyUnlocked) {
        try {
          db.exec('BEGIN IMMEDIATE');
          const freshUser = db
            .prepare('SELECT wallet_balance FROM users WHERE id = ?')
            .get(user.id) as { wallet_balance: number };

          if (roundMoney(freshUser.wallet_balance) < price) {
            db.exec('ROLLBACK');
            res.status(402).json({
              error: `Insufficient wallet balance. This game requires ₹${price.toFixed(2)}, and your balance is ₹${roundMoney(freshUser.wallet_balance).toFixed(2)}.`,
              insufficientFunds: true,
              requiredAmount: price,
              currentBalance: roundMoney(freshUser.wallet_balance),
            });
            return;
          }

          const newBalance = roundMoney(freshUser.wallet_balance - price);
          const ts = nowIso();
          db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, user.id);

          const refId = `GAME-${Date.now().toString().slice(-6)}`;
          db.prepare(
            `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
             VALUES (?, 'game_purchase', ?, ?, ?, ?, ?)`
          ).run(user.id, -price, newBalance, `Paid game access: ${game.title}`, refId, ts);

          db.prepare(
            'INSERT INTO game_unlocks (user_id, game_id, amount_paid, created_at) VALUES (?, ?, ?, ?)'
          ).run(user.id, game.id, price, ts);

          logActivity({
            userId: user.id,
            category: 'wallet',
            title: `Purchased Game Access · ${game.name}`,
            details: `${game.billing_mode === 'once' ? 'One-time unlock' : 'Play entry'} for ${game.title}. New balance: ₹${newBalance.toFixed(2)}.`,
            amount: -price,
            status: 'Completed',
            createdAt: ts,
          });

          db.exec('COMMIT');
          chargedAmount = price;
        } catch (err) {
          db.exec('ROLLBACK');
          console.error('Game purchase error:', err);
          res.status(500).json({ error: 'Could not process paid game access.' });
          return;
        }
      }
    }

    logActivity({
      userId: user.id,
      category: 'game',
      title: `Launched ${game.name}`,
      details: chargedAmount > 0 ? `Paid ₹${chargedAmount.toFixed(2)} and started session.` : 'Started game session.',
      amount: chargedAmount > 0 ? -chargedAmount : null,
      status: 'Played',
    });

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as DbUser;

    const explicitEmbed =
      game.game_mode === 'embed' ? sanitizeEmbedUrl(game.embed_url) : null;
    const embedMatch = game.html_code.match(
      /<iframe[^>]+id=["']gameFrame["'][^>]+src=["']([^"']+)["']/i
    );
    const embedUrl = explicitEmbed || (embedMatch ? sanitizeEmbedUrl(embedMatch[1]) : null);
    const compiledDocument = explicitEmbed
      ? buildEmbedWrapperHtml(game.title, explicitEmbed)
      : compileGameDocument(game.html_code, game.css_code, game.js_code);
    const modMenuConfig = normalizeModMenuConfig(game.mod_menu_config, game.slug);

      res.json({
        game: {
          id: game.id,
          slug: game.slug,
          name: game.name,
          title: game.title,
          pricing_type: game.pricing_type,
          price,
          billing_mode: game.billing_mode,
          gameMode: game.game_mode === 'embed' ? 'embed' : 'source',
          embedUrl: embedUrl || '',
          modMenuConfig,
          isDefault: Boolean(game.is_default),
        },
        chargedAmount,
        embedUrl,
        srcDoc: compiledDocument,
        user: serializeUser(updatedUser),
      });
    } catch (err) {
      console.error('Game access error:', err);
      res.status(500).json({ error: 'Unable to launch game right now. Please try again.' });
    }
  });

  app.get('/api/wallet/summary', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const settings = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get() as {
      upi_id: string;
      payee_name: string;
      instructions: string;
      deposits_enabled: number;
      min_deposit: number;
      max_deposit: number;
    };

    const deposits = db
      .prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 50')
      .all(user.id);

    const transactions = db
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50')
      .all(user.id);

    res.json({
      walletBalance: roundMoney(user.wallet_balance),
      paymentSettings: {
        upiId: settings.upi_id,
        payeeName: settings.payee_name,
        instructions: settings.instructions,
        depositsEnabled: Boolean(settings.deposits_enabled),
        minDeposit: roundMoney(settings.min_deposit),
        maxDeposit: roundMoney(settings.max_deposit),
      },
      deposits,
      transactions,
    });
  });

  app.post('/api/deposits/qr', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const amount = roundMoney(Number(req.body?.amount));
      const settings = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get() as {
        upi_id: string;
        payee_name: string;
        instructions: string;
        deposits_enabled: number;
        min_deposit: number;
        max_deposit: number;
      };

      if (!settings.deposits_enabled) {
        res.status(400).json({ error: 'Deposits are currently paused by the administrator.' });
        return;
      }
      if (!Number.isFinite(amount) || amount < settings.min_deposit || amount > settings.max_deposit) {
        res.status(400).json({
          error: `Enter an amount between ₹${settings.min_deposit} and ₹${settings.max_deposit}.`,
        });
        return;
      }

      const note = `KWG Wallet UID ${req.user!.uid}`;
      const upiUri =
        `upi://pay?pa=${encodeURIComponent(settings.upi_id)}` +
        `&pn=${encodeURIComponent(settings.payee_name)}` +
        `&am=${amount.toFixed(2)}` +
        `&cu=INR` +
        `&tn=${encodeURIComponent(note)}`;

      const qrDataUrl = await QRCode.toDataURL(upiUri, {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      res.json({
        amount,
        upiId: settings.upi_id,
        payeeName: settings.payee_name,
        instructions: settings.instructions,
        upiUri,
        qrDataUrl,
      });
    } catch (err) {
      console.error('QR generation error:', err);
      res.status(500).json({ error: 'Failed to generate UPI QR code.' });
    }
  });

  app.post('/api/deposits/request', requireAuth, (req: AuthedRequest, res) => {
    try {
      const amount = roundMoney(Number(req.body?.amount));
      const utr = String(req.body?.utr || '').trim();
      const user = req.user!;

      const settings = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get() as {
        upi_id: string;
        deposits_enabled: number;
        min_deposit: number;
        max_deposit: number;
      };

      if (!settings.deposits_enabled) {
        res.status(400).json({ error: 'Deposits are currently disabled by the administrator.' });
        return;
      }
      if (!Number.isFinite(amount) || amount < settings.min_deposit || amount > settings.max_deposit) {
        res.status(400).json({
          error: `Deposit amount must be between ₹${settings.min_deposit} and ₹${settings.max_deposit}.`,
        });
        return;
      }
      if (utr.length < 6) {
        res.status(400).json({ error: 'Enter a valid UPI transaction reference / UTR number (minimum 6 characters).' });
        return;
      }

      const dupUtr = db.prepare("SELECT id FROM deposits WHERE utr = ? AND status != 'rejected'").get(utr);
      if (dupUtr) {
        res.status(409).json({ error: 'This UTR reference has already been submitted.' });
        return;
      }

      const ts = nowIso();
      const refId = `DEP-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;

      db.prepare(
        `INSERT INTO deposits (reference_id, user_id, amount, utr, upi_id, status, admin_notice, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', '', ?)`
      ).run(refId, user.id, amount, utr, settings.upi_id, ts);

      logActivity({
        userId: user.id,
        category: 'deposit',
        title: `Deposit Request Submitted (${refId})`,
        details: `UPI ID: ${settings.upi_id} · UTR: ${utr}. Awaiting admin payment verification.`,
        amount,
        status: 'Pending',
        createdAt: ts,
      });

      const deposit = db.prepare('SELECT * FROM deposits WHERE reference_id = ?').get(refId);
      res.status(201).json({ deposit });
    } catch (err) {
      console.error('Deposit request error:', err);
      res.status(500).json({ error: 'Unable to submit deposit request right now. Please try again.' });
    }
  });

  app.get('/api/history', requireAuth, (req: AuthedRequest, res) => {
    const category = String(req.query.category || 'all');
    let rows;
    if (category && category !== 'all') {
      rows = db
        .prepare('SELECT * FROM activity_logs WHERE user_id = ? AND category = ? ORDER BY id DESC LIMIT 200')
        .all(req.user!.id, category);
    } else {
      rows = db
        .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 200')
        .all(req.user!.id);
    }
    res.json({ history: rows });
  });

  const PARTNER_WINGO_SLUGS = new Set([
    'yaarwin',
    'tg-dream',
    'jai-club',
    'dm-play',
    'khelv-888',
    '9k-club',
  ]);

  app.get('/api/mod-history', requireAuth, (req: AuthedRequest, res) => {
    const gameSlug = String(req.query.gameSlug || '').trim();
    const entryTypeParam = String(req.query.entryType || '').trim();
    const entryType =
      entryTypeParam === 'manual' || entryTypeParam === 'auto' ? entryTypeParam : null;

    let query = 'SELECT * FROM mod_menu_history WHERE user_id = ?';
    const params: (string | number)[] = [req.user!.id];
    if (gameSlug) {
      query += ' AND game_slug = ?';
      params.push(gameSlug);
    }
    if (entryType) {
      query += ' AND entry_type = ?';
      params.push(entryType);
    }
    query += ' ORDER BY id DESC LIMIT 400';

    const rows = db.prepare(query).all(...params) as Array<{
      id: number;
      user_id: number;
      game_slug: string;
      game_name: string;
      period_id: string;
      signal: 'BIG' | 'SMALL';
      level: number;
      max_levels: number;
      bet_amount: number;
      outcome: 'WIN' | 'LOSS' | 'STOP';
      pnl_delta: number;
      entry_type: 'manual' | 'auto';
      actual_number: number | null;
      actual_result: 'BIG' | 'SMALL' | '';
      created_at: string;
    }>;

    const computeStats = (list: typeof rows) => {
      let wins = 0;
      let losses = 0;
      let netPnl = 0;
      for (const r of list) {
        if (r.outcome === 'WIN') wins += 1;
        else losses += 1;
        netPnl += Number(r.pnl_delta || 0);
      }
      const total = list.length;
      return {
        total,
        wins,
        losses,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        netPnl: roundMoney(netPnl),
      };
    };

    res.json({
      records: rows,
      stats: computeStats(rows),
      manualStats: computeStats(rows.filter((r) => r.entry_type !== 'auto')),
      autoStats: computeStats(rows.filter((r) => r.entry_type === 'auto')),
    });
  });

  app.post('/api/mod-history', requireAuth, (req: AuthedRequest, res) => {
    const gameSlug = String(req.body?.gameSlug || '').trim();
    const gameName = String(req.body?.gameName || '').trim();
    const periodId = String(req.body?.periodId || '').trim();
    const signal = req.body?.signal === 'SMALL' ? 'SMALL' : 'BIG';
    const entryType: 'manual' | 'auto' = req.body?.entryType === 'auto' ? 'auto' : 'manual';
    const level = Math.max(1, Math.min(5, Math.round(Number(req.body?.level || 1))));
    const maxLevels = Math.max(1, Math.min(5, Math.round(Number(req.body?.maxLevels || 5))));
    const betAmount = roundMoney(Number(req.body?.betAmount || 0));
    const outcome =
      req.body?.outcome === 'WIN' ? 'WIN' : req.body?.outcome === 'STOP' ? 'STOP' : 'LOSS';
    const pnlDelta = roundMoney(Number(req.body?.pnlDelta || 0));
    const actualNumberRaw = req.body?.actualNumber;
    const actualNumber =
      actualNumberRaw !== undefined && actualNumberRaw !== null && Number.isFinite(Number(actualNumberRaw))
        ? Math.max(0, Math.min(9, Math.round(Number(actualNumberRaw))))
        : null;
    const actualResult =
      req.body?.actualResult === 'BIG' || req.body?.actualResult === 'SMALL'
        ? req.body.actualResult
        : '';

    if (
      !gameSlug ||
      !gameName ||
      !periodId ||
      (entryType === 'manual' && (!Number.isFinite(betAmount) || betAmount <= 0)) ||
      (entryType === 'auto' && !PARTNER_WINGO_SLUGS.has(gameSlug))
    ) {
      res.status(400).json({ error: 'Invalid mod menu round details.' });
      return;
    }

    if (entryType === 'auto') {
      const existing = db
        .prepare(
          "SELECT * FROM mod_menu_history WHERE user_id = ? AND game_slug = ? AND period_id = ? AND entry_type = 'auto' LIMIT 1"
        )
        .get(req.user!.id, gameSlug, periodId);
      if (existing) {
        res.json({ record: existing, deduplicated: true });
        return;
      }
    }

    const ts = nowIso();
    const result = db
      .prepare(
        `INSERT INTO mod_menu_history
         (user_id, game_slug, game_name, period_id, signal, level, max_levels, bet_amount, outcome, pnl_delta, entry_type, actual_number, actual_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user!.id,
        gameSlug,
        gameName,
        periodId,
        signal,
        level,
        maxLevels,
        betAmount,
        outcome,
        pnlDelta,
        entryType,
        actualNumber,
        actualResult,
        ts
      );

    if (entryType === 'manual') {
      logActivity({
        userId: req.user!.id,
        category: 'game',
        title: `${gameName} · ${outcome} (#${periodId.slice(-4)})`,
        details: `Period ${periodId} · Signal ${signal} · Level ${level}/${maxLevels} · Bet ₹${betAmount}`,
        amount: pnlDelta,
        status: outcome,
        createdAt: ts,
      });
    }

    const record = db
      .prepare('SELECT * FROM mod_menu_history WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ record });
  });

  app.post('/api/mod-history/auto-sync', requireAuth, (req: AuthedRequest, res) => {
    const gameSlug = String(req.body?.gameSlug || '').trim();
    const gameName = String(req.body?.gameName || '').trim();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (!PARTNER_WINGO_SLUGS.has(gameSlug) || !gameName) {
      res.status(400).json({ error: 'Automatic API history is only available for supported Wingo 1M partner games.' });
      return;
    }

    const activeGameRow = db
      .prepare('SELECT slug, name FROM games WHERE slug = ?')
      .get(gameSlug) as { slug: string; name: string } | undefined;
    if (!activeGameRow) {
      res.status(404).json({ error: 'Game no longer exists on the platform.' });
      return;
    }

    let insertedCount = 0;
    try {
      db.exec('BEGIN IMMEDIATE');
      const checkStmt = db.prepare(
        "SELECT id FROM mod_menu_history WHERE user_id = ? AND game_slug = ? AND period_id = ? AND entry_type = 'auto' LIMIT 1"
      );
      const insertStmt = db.prepare(
        `INSERT INTO mod_menu_history
         (user_id, game_slug, game_name, period_id, signal, level, max_levels, bet_amount, outcome, pnl_delta, entry_type, actual_number, actual_result, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 5, 0, ?, 0, 'auto', ?, ?, ?)`
      );

      for (const raw of entries.slice(0, 30)) {
        const periodId = String(raw?.periodId || '').trim();
        const signal = raw?.signal === 'SMALL' ? 'SMALL' : raw?.signal === 'BIG' ? 'BIG' : null;
        const num = Number(raw?.actualNumber);
        const actualResult =
          raw?.actualResult === 'BIG' || raw?.actualResult === 'SMALL'
            ? raw.actualResult
            : Number.isFinite(num)
            ? num >= 5
              ? 'BIG'
              : 'SMALL'
            : null;
        const outcome = raw?.outcome === 'WIN' ? 'WIN' : raw?.outcome === 'LOSS' ? 'LOSS' : null;

        if (
          !periodId ||
          !/^\d{8,32}$/.test(periodId) ||
          !signal ||
          !actualResult ||
          !outcome ||
          !Number.isInteger(num) ||
          num < 0 ||
          num > 9
        ) {
          continue;
        }

        const exists = checkStmt.get(req.user!.id, gameSlug, periodId);
        if (!exists) {
          insertStmt.run(
            req.user!.id,
            gameSlug,
            gameName,
            periodId,
            signal,
            outcome,
            num,
            actualResult,
            nowIso()
          );
          insertedCount += 1;
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Auto sync mod history error:', err);
      res.status(500).json({ error: 'Failed to save automatic history.' });
      return;
    }

    const records = db
      .prepare(
        "SELECT * FROM mod_menu_history WHERE user_id = ? AND game_slug = ? AND entry_type = 'auto' ORDER BY period_id DESC, id DESC LIMIT 200"
      )
      .all(req.user!.id, gameSlug);

    res.json({ insertedCount, records });
  });

  app.delete('/api/mod-history', requireAuth, (req: AuthedRequest, res) => {
    const gameSlug = String(req.query.gameSlug || '').trim();
    const entryTypeParam = String(req.query.entryType || '').trim();
    if (entryTypeParam === 'auto') {
      res.status(403).json({
        error: 'Automatic API history is permanent and cannot be deleted unless the game is removed.',
      });
      return;
    }

    let query = "DELETE FROM mod_menu_history WHERE user_id = ? AND entry_type = 'manual'";
    const params: (string | number)[] = [req.user!.id];
    if (gameSlug) {
      query += ' AND game_slug = ?';
      params.push(gameSlug);
    }
    db.prepare(query).run(...params);
    res.json({ ok: true });
  });

  function saveLiveDrawsToDb(
    interval: '30s' | '1m',
    draws: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>,
    source = 'live-api'
  ) {
    if (!Array.isArray(draws) || draws.length === 0) return;
    const ts = nowIso();
    const insertStmt = db.prepare(
      `INSERT OR REPLACE INTO wingo_live_draws (interval, issue_number, number, actual_result, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const settleStmt = db.prepare(
      `UPDATE ai_prediction_history
       SET actual_number = ?,
           actual_result = ?,
           outcome = CASE
             WHEN signal = 'SKIP' OR outcome = 'SKIPPED' THEN 'SKIPPED'
             WHEN signal = ? THEN 'WIN'
             ELSE 'LOSS'
           END
       WHERE interval = ? AND period_id = ? AND (outcome = 'PENDING' OR (outcome = 'SKIPPED' AND actual_result = ''))`
    );
    for (const d of draws.slice(0, 60)) {
      const issue = String(d?.issueNumber || '').trim();
      const num = Number(d?.number);
      if (!issue || !/^\d{8,32}$/.test(issue) || !Number.isInteger(num) || num < 0 || num > 9) {
        continue;
      }
      const actualRes: 'BIG' | 'SMALL' = num >= 5 ? 'BIG' : 'SMALL';
      insertStmt.run(interval, issue, num, actualRes, source, ts);
      settleStmt.run(num, actualRes, actualRes, interval, issue);
    }
    db.prepare(
      `DELETE FROM wingo_live_draws
       WHERE interval = ? AND issue_number NOT IN (
         SELECT issue_number FROM wingo_live_draws WHERE interval = ? ORDER BY issue_number DESC LIMIT 120
       )`
    ).run(interval, interval);
  }

  function loadStoredLiveDraws(
    interval: '30s' | '1m',
    limit = 30
  ): Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }> {
    const normalizeAndSort = (
      items: Array<{ issueNumber?: unknown; number?: unknown }>
    ): Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }> => {
      const seen = new Set<string>();
      const valid: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }> = [];
      for (const item of items) {
        const issueNumber = String(item?.issueNumber || '').trim();
        const num = Number(item?.number);
        if (!issueNumber || !/^\d{8,32}$/.test(issueNumber) || !Number.isInteger(num) || num < 0 || num > 9) {
          continue;
        }
        if (seen.has(issueNumber)) continue;
        seen.add(issueNumber);
        valid.push({
          issueNumber,
          number: num,
          actualResult: num >= 5 ? 'BIG' : 'SMALL',
        });
      }
      return valid
        .sort((a, b) => {
          const diff = BigInt(b.issueNumber) - BigInt(a.issueNumber);
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        })
        .slice(0, limit);
    };

    const rows = db
      .prepare(
        `SELECT issue_number AS issueNumber, number, actual_result AS actualResult
         FROM wingo_live_draws
         WHERE interval = ?
         ORDER BY LENGTH(issue_number) DESC, issue_number DESC
         LIMIT ?`
      )
      .all(interval, Math.max(limit * 2, 40)) as Array<{
      issueNumber: string;
      number: number;
      actualResult: 'BIG' | 'SMALL';
    }>;

    const normalizedRows = normalizeAndSort(rows);
    if (normalizedRows.length > 0 || interval === '30s') {
      return normalizedRows;
    }

    // Fallback for 1m: inspect verified actual draws logged in mod_menu_history
    const fallbackRows = db
      .prepare(
        `SELECT DISTINCT period_id AS issueNumber, actual_number AS number, actual_result AS actualResult
         FROM mod_menu_history
         WHERE actual_number IS NOT NULL
         ORDER BY LENGTH(period_id) DESC, period_id DESC
         LIMIT ?`
      )
      .all(Math.max(limit * 2, 40)) as Array<{
      issueNumber: string;
      number: number;
      actualResult: 'BIG' | 'SMALL';
    }>;
    return normalizeAndSort(fallbackRows);
  }

  app.post('/api/wingo/issue', async (req, res) => {
    const interval: '30s' | '1m' = req.body?.interval === '30s' ? '30s' : '1m';
    const typeId = interval === '30s' ? 30 : 1;
    const maxSec = interval === '30s' ? 30 : 60;
    const WINGO_API_URL = 'https://api.bdg88zf.com/api/webapi/GetGameIssue';
    const random = '40079dcba93a48769c6ee9d4d4fae23f';
    const sorted = {
      language: 0,
      random,
      typeId,
    };
    const signature = crypto
      .createHash('md5')
      .update(JSON.stringify(sorted))
      .digest('hex')
      .toUpperCase();
    const WINGO_API_PAYLOAD = {
      typeId,
      language: 0,
      random,
      signature,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const getFallbackUtcIssue = () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      if (interval === '30s') {
        const idx =
          now.getUTCHours() * 120 +
          now.getUTCMinutes() * 2 +
          Math.floor(now.getUTCSeconds() / 30) +
          1;
        return {
          issueNumber: `${y}${m}${d}10005${String(idx).padStart(4, '0')}`,
          secLeft: 30 - (now.getUTCSeconds() % 30),
        };
      }
      const minuteIndex = now.getUTCHours() * 60 + now.getUTCMinutes() + 1;
      return {
        issueNumber: `${y}${m}${d}10001${String(minuteIndex).padStart(4, '0')}`,
        secLeft: 60 - now.getUTCSeconds(),
      };
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2400);
      const upstream = await fetch(WINGO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(WINGO_API_PAYLOAD),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = upstream.headers.get('content-type') || '';
      if (upstream.ok && contentType.includes('application/json')) {
        const json = (await upstream.json()) as {
          code?: number;
          data?: {
            issueNumber?: string;
            startTime?: string;
            endTime?: string;
            serviceTime?: string;
          };
        };
        if (json?.data?.issueNumber) {
          let secLeft = getFallbackUtcIssue().secLeft;
          if (json.data.endTime && json.data.serviceTime) {
            const endMs = Date.parse(json.data.endTime.replace(' ', 'T') + 'Z');
            const srvMs = Date.parse(json.data.serviceTime.replace(' ', 'T') + 'Z');
            if (!Number.isNaN(endMs) && !Number.isNaN(srvMs)) {
              secLeft = Math.max(1, Math.min(maxSec, Math.round((endMs - srvMs) / 1000)));
            }
          }
          res.json({
            source: 'api',
            interval,
            issueNumber: String(json.data.issueNumber),
            startTime: json.data.startTime || null,
            endTime: json.data.endTime || null,
            serviceTime: json.data.serviceTime || null,
            secLeft,
          });
          return;
        }
      }
    } catch {
      // fall through to synchronized UTC clock
    }

    const fallback = getFallbackUtcIssue();
    res.json({
      source: 'sync',
      interval,
      issueNumber: fallback.issueNumber,
      secLeft: fallback.secLeft,
    });
  });

  async function fetchUpstreamWingoResults(
    pageSize = 20,
    interval: '30s' | '1m' = '1m'
  ): Promise<Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>> {
    const WINGO_RESULTS_URL = 'https://api.bdg88zf.com/api/webapi/GetNoaverageEmerdList';
    const typeId = interval === '30s' ? 30 : 1;
    const random = '40079dcba93a48769c6ee9d4d4fae23f';
    const sorted = {
      language: 0,
      pageNo: 1,
      pageSize,
      random,
      typeId,
    };
    const signature = crypto
      .createHash('md5')
      .update(JSON.stringify(sorted))
      .digest('hex')
      .toUpperCase();

    const payload = {
      pageSize,
      pageNo: 1,
      typeId,
      language: 0,
      random,
      signature,
      timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2400);
      const upstream = await fetch(WINGO_RESULTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = upstream.headers.get('content-type') || '';
      if (upstream.ok && contentType.includes('application/json')) {
        const json = (await upstream.json()) as {
          data?: {
            list?: Array<{
              issueNumber?: string;
              number?: string | number;
            }>;
          };
        };
        const rawList = Array.isArray(json?.data?.list) ? json.data.list : [];
        const parsed = rawList
          .map((item) => {
            const issueNumber = String(item?.issueNumber || '').trim();
            const num = Number.parseInt(String(item?.number ?? ''), 10);
            if (!issueNumber || Number.isNaN(num) || num < 0 || num > 9) return null;
            return {
              issueNumber,
              number: num,
              actualResult: (num >= 5 ? 'BIG' : 'SMALL') as 'BIG' | 'SMALL',
            };
          })
          .filter(
            (x): x is { issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' } =>
              x !== null
          );
        if (parsed.length > 0) {
          saveLiveDrawsToDb(interval, parsed, 'live-api');
        }
        return parsed;
      }
    } catch {
      // upstream unreachable or blocked
    }
    return [];
  }

  function computeWingoColorMeta(num: number): { color: 'GREEN' | 'RED'; hasViolet: boolean } {
    const n = Math.max(0, Math.min(9, Math.round(num)));
    return {
      color: n % 2 === 1 ? 'GREEN' : 'RED',
      hasViolet: n === 0 || n === 5,
    };
  }

  app.post('/api/wingo/sync-draws', requireAuth, (req, res) => {
    const interval: '30s' | '1m' = req.body?.interval === '30s' ? '30s' : '1m';
    const rawList = Array.isArray(req.body?.list) ? req.body.list : [];
    const valid = rawList
      .map((item: { issueNumber?: unknown; number?: unknown }) => {
        const issueNumber = String(item?.issueNumber || '').trim();
        const num = Number.parseInt(String(item?.number ?? ''), 10);
        if (!issueNumber || !/^\d{8,32}$/.test(issueNumber) || Number.isNaN(num) || num < 0 || num > 9) {
          return null;
        }
        return {
          issueNumber,
          number: num,
          actualResult: (num >= 5 ? 'BIG' : 'SMALL') as 'BIG' | 'SMALL',
        };
      })
      .filter(
        (x: { issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' } | null): x is {
          issueNumber: string;
          number: number;
          actualResult: 'BIG' | 'SMALL';
        } => x !== null
      );
    if (valid.length > 0) {
      saveLiveDrawsToDb(interval, valid, 'client-api');
    }
    res.json({ ok: true, saved: valid.length });
  });

  app.post('/api/wingo/results', async (req, res) => {
    const interval: '30s' | '1m' = req.body?.interval === '30s' ? '30s' : '1m';
    const pageSize = Math.max(10, Math.min(40, Number(req.body?.pageSize) || 30));
    const list = await fetchUpstreamWingoResults(pageSize, interval);
    if (list.length > 0) {
      res.json({ source: 'api', interval, list });
      return;
    }
    const stored = loadStoredLiveDraws(interval, pageSize);
    if (stored.length > 0) {
      res.json({ source: 'stored-history', interval, list: stored });
      return;
    }
    res.json({ source: 'unavailable', interval, list: [] });
  });

  const aiPeriodCache = new Map<
    string,
    {
      expiresAt: number;
      payload: {
        prediction: Record<string, unknown>;
        recentResults: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>;
        apiSource: string;
      };
    }
  >();
  const aiInFlightMap = new Map<
    string,
    Promise<{
      prediction: Record<string, unknown>;
      recentResults: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>;
      apiSource: string;
    }>
  >();

  async function callGeminiWithTimeout(
    ai: GoogleGenAI,
    params: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
      timeoutMs: number;
    }
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Gemini request timed out')), params.timeoutMs);
    try {
      return await ai.models.generateContent({
        model: params.model,
        contents: params.contents,
        config: {
          ...params.config,
          abortSignal: controller.signal,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function recordAiPredictionForUser(
    userId: number,
    gameSlug: string,
    gameName: string,
    interval: '30s' | '1m',
    periodId: string,
    prediction: Record<string, unknown>
  ) {
    const sig =
      prediction.label === 'SKIP'
        ? 'SKIP'
        : prediction.label === 'SMALL'
        ? 'SMALL'
        : prediction.label === 'BIG'
        ? 'BIG'
        : null;
    if (!sig) return;
    const digit = Math.max(0, Math.min(9, Math.round(Number(prediction.number) || 0)));
    const color = prediction.color === 'GREEN' ? 'GREEN' : 'RED';
    const hasViolet = prediction.hasViolet ? 1 : 0;
    const confidence = Math.max(0, Math.min(100, Math.round(Number(prediction.prob) || 60)));
    const selectedStrategy = String(prediction.selectedStrategy || '').slice(0, 80);
    const strategyTag = String(prediction.strategyTag || '').slice(0, 80);
    const reasonSummary = String(prediction.reasonSummary || '').slice(0, 260);
    const initialOutcome = sig === 'SKIP' ? 'SKIPPED' : 'PENDING';
    const ts = nowIso();

    try {
      db.prepare(
        `INSERT OR IGNORE INTO ai_prediction_history
         (user_id, game_slug, game_name, interval, period_id, signal, digit, color, has_violet, confidence, selected_strategy, strategy_tag, reason_summary, actual_number, actual_result, outcome, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?)`
      ).run(
        userId,
        gameSlug,
        gameName,
        interval,
        periodId,
        sig,
        digit,
        color,
        hasViolet,
        confidence,
        selectedStrategy,
        strategyTag,
        reasonSummary,
        initialOutcome,
        ts
      );

      db.prepare(
        `DELETE FROM ai_prediction_history
         WHERE user_id = ? AND id NOT IN (
           SELECT id FROM ai_prediction_history WHERE user_id = ? ORDER BY id DESC LIMIT 150
         )`
      ).run(userId, userId);
    } catch (err) {
      console.error('Persist ai_prediction_history warning:', err);
    }
  }

  function evaluateDrawConfusion(
    historyDesc: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>,
    combinedEngine: ReturnType<typeof runCombinedWingoEngine>
  ) {
    const recentWindow = historyDesc.slice(0, 14);
    const newest = recentWindow[0];
    let streakLen = 1;
    for (let i = 1; i < recentWindow.length; i += 1) {
      if (recentWindow[i].actualResult === newest.actualResult) streakLen += 1;
      else break;
    }
    let flips = 0;
    const zigLen = Math.min(10, Math.max(0, recentWindow.length - 1));
    for (let i = 0; i < zigLen; i += 1) {
      if (recentWindow[i].actualResult !== recentWindow[i + 1].actualResult) flips += 1;
    }
    const chopRatio = zigLen > 0 ? flips / zigLen : 0.5;
    const slice10 = historyDesc.slice(0, 10);
    const bigCount10 = slice10.filter((r) => r.actualResult === 'BIG').length;
    const smallCount10 = slice10.length - bigCount10;

    const chrono = [...historyDesc].reverse();
    let bb = 0, bs = 0, sb = 0, ss = 0;
    const latestBigram =
      historyDesc.length >= 2
        ? `${historyDesc[1].actualResult[0]}${historyDesc[0].actualResult[0]}`
        : '';
    const latestTrigram =
      historyDesc.length >= 3
        ? `${historyDesc[2].actualResult[0]}${historyDesc[1].actualResult[0]}${historyDesc[0].actualResult[0]}`
        : '';
    let bigramNextBig = 0, bigramNextSmall = 0;
    let trigramNextBig = 0, trigramNextSmall = 0;
    for (let i = 0; i < chrono.length - 1; i += 1) {
      const c = chrono[i].actualResult;
      const n = chrono[i + 1].actualResult;
      if (c === 'BIG' && n === 'BIG') bb += 1;
      else if (c === 'BIG' && n === 'SMALL') bs += 1;
      else if (c === 'SMALL' && n === 'BIG') sb += 1;
      else ss += 1;
      if (i >= 1 && latestBigram) {
        const bg = `${chrono[i - 1].actualResult[0]}${chrono[i].actualResult[0]}`;
        if (bg === latestBigram) {
          if (n === 'BIG') bigramNextBig += 1;
          else bigramNextSmall += 1;
        }
      }
      if (i >= 2 && latestTrigram) {
        const tg = `${chrono[i - 2].actualResult[0]}${chrono[i - 1].actualResult[0]}${chrono[i].actualResult[0]}`;
        if (tg === latestTrigram) {
          if (n === 'BIG') trigramNextBig += 1;
          else trigramNextSmall += 1;
        }
      }
    }

    const markovStayFromNewest =
      newest.actualResult === 'BIG'
        ? bb + bs > 0
          ? bb / (bb + bs)
          : 0.5
        : sb + ss > 0
        ? ss / (sb + ss)
        : 0.5;
    const bigramTotal = bigramNextBig + bigramNextSmall;
    const trigramTotal = trigramNextBig + trigramNextSmall;

    const activeStratList = [
      combinedEngine.strategies.patternBrain,
      combinedEngine.strategies.momentumTrend,
      combinedEngine.strategies.dragonContrarian,
    ].filter((s) => s.active);
    const effStratList =
      activeStratList.length > 0
        ? activeStratList
        : [
            combinedEngine.strategies.patternBrain,
            combinedEngine.strategies.momentumTrend,
            combinedEngine.strategies.dragonContrarian,
          ];
    const hasBigVote = effStratList.some((s) => s.signal === 'BIG');
    const hasSmallVote = effStratList.some((s) => s.signal === 'SMALL');
    const allNeutral = effStratList.every((s) => s.signal === 'NEUTRAL');
    const isConflictedEngine =
      allNeutral ||
      (hasBigVote && hasSmallVote && Math.abs(combinedEngine.combinedScore) < 0.8) ||
      (combinedEngine.consensusType === 'AUTONOMOUS WEIGHTED' &&
        Math.abs(combinedEngine.combinedScore) < 0.72);
    const isBalanced10 = Math.abs(bigCount10 - smallCount10) <= 2;
    const isMarkovTied = Math.abs(markovStayFromNewest - 0.5) <= 0.08;
    const isBigramWeak = bigramTotal < 3 || Math.abs(bigramNextBig - bigramNextSmall) <= 1;
    const isTrigramWeak = trigramTotal < 2 || Math.abs(trigramNextBig - trigramNextSmall) <= 1;
    const isAmbiguousChop = chopRatio >= 0.35 && chopRatio <= 0.65;

    let confusionScore = 0;
    if (isConflictedEngine) confusionScore += 2;
    if (isBalanced10) confusionScore += 1;
    if (isMarkovTied) confusionScore += 1;
    if (isBigramWeak && isTrigramWeak) confusionScore += 1;
    if (isAmbiguousChop && streakLen <= 2) confusionScore += 1;
    if (combinedEngine.consensusType === 'THREE-WAY AGREEMENT') confusionScore -= 2;
    if (streakLen >= 3 || chopRatio >= 0.72 || Math.abs(bigCount10 - smallCount10) >= 6) {
      confusionScore -= 1;
    }
    confusionScore = Math.max(0, Math.min(6, confusionScore));
    const highConfusion =
      confusionScore >= 3 && combinedEngine.consensusType !== 'THREE-WAY AGREEMENT';

    return {
      streakLen,
      flips,
      zigLen,
      chopRatio,
      bigCount10,
      smallCount10,
      confusionScore,
      highConfusion,
      bb,
      bs,
      sb,
      ss,
      latestBigram,
      latestTrigram,
      bigramNextBig,
      bigramNextSmall,
      bigramTotal,
      trigramNextBig,
      trigramNextSmall,
      trigramTotal,
      markovStayFromNewest,
    };
  }

  function buildEngineFallbackPrediction(
    historyDesc: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>,
    combinedEngine: ReturnType<typeof runCombinedWingoEngine>,
    confusion: ReturnType<typeof evaluateDrawConfusion>,
    interval: '30s' | '1m'
  ) {
    const activeConfs = [
      combinedEngine.strategies.patternBrain,
      combinedEngine.strategies.momentumTrend,
      combinedEngine.strategies.dragonContrarian,
    ]
      .filter((s) => (combinedEngine.activeCount > 0 ? s.active : true))
      .map((s) => s.confidence);
    const avgConf =
      activeConfs.length > 0
        ? Math.round(activeConfs.reduce((a, b) => a + b, 0) / activeConfs.length)
        : 60;
    const estConf = Math.min(
      92,
      Math.max(
        48,
        avgConf +
          (combinedEngine.consensusType === 'THREE-WAY AGREEMENT'
            ? 5
            : combinedEngine.consensusType === 'MAJORITY SIGNAL'
            ? 1
            : -4)
      )
    );
    const shouldSkip =
      confusion.highConfusion ||
      combinedEngine.finalSignal === 'INSUFFICIENT DATA' ||
      estConf < 64;
    const label: 'BIG' | 'SMALL' | 'SKIP' = shouldSkip
      ? 'SKIP'
      : combinedEngine.finalSignal === 'SMALL'
      ? 'SMALL'
      : 'BIG';
    let pickedNum = combinedEngine.suggestedDigit;
    if (label === 'BIG' && pickedNum < 5) pickedNum += 5;
    else if (label === 'SMALL' && pickedNum >= 5) pickedNum -= 5;
    const { color, hasViolet } = computeWingoColorMeta(pickedNum);
    const prob = label === 'SKIP' ? Math.max(35, Math.min(58, estConf)) : estConf;
    const allWalletSureshot =
      label !== 'SKIP' && combinedEngine.consensusType === 'THREE-WAY AGREEMENT' && prob >= 90;

    return {
      label,
      number: pickedNum,
      color,
      hasViolet,
      prob,
      sureshot: label !== 'SKIP' && prob >= 84,
      allWalletSureshot,
      sureshotNote: allWalletSureshot
        ? `3/3 High-Conviction Lock · ${label}`
        : undefined,
      source: 'gemini-ai' as const,
      selectedStrategy:
        label === 'SKIP'
          ? 'AI Confusion Guard (SKIP)'
          : combinedEngine.selectedApproach || 'Autonomous 3-Strategy AI',
      dataProblem: false,
      strategyTag:
        label === 'SKIP'
          ? 'AI SKIP GUARD · WAIT'
          : `${combinedEngine.agreementLabel} ${combinedEngine.selectedApproach}`.slice(0, 56),
      reasonSummary: (label === 'SKIP'
        ? `Confusing ${confusion.bigCount10}B/${confusion.smallCount10}S chop (${Math.round(confusion.chopRatio * 100)}% flips) & split strategies — SKIP & wait for clear setup.`
        : combinedEngine.summaryReason
      ).slice(0, 220),
      analyzedCount: historyDesc.length,
      interval,
      combinedAnalysis: combinedEngine,
      lastResultsPreview: historyDesc.slice(0, 5).map((r) => ({
        issueShort: r.issueNumber.slice(-4),
        number: r.number,
        actualResult: r.actualResult,
        color: computeWingoColorMeta(r.number).color,
      })),
    };
  }

  function backfillMissedAiPeriodsForUser(
    userId: number,
    gameSlug: string,
    gameName: string,
    interval: '30s' | '1m',
    targetPeriodId: string,
    availableDraws: Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>,
    strategyConfig: ReturnType<typeof serializePlatformConfig>['strategyConfig'],
    fallbackPredictorMode: PredictorMode
  ) {
    if (!/^\d{10,32}$/.test(targetPeriodId)) return;
    try {
      const latestRow = db
        .prepare(
          `SELECT period_id FROM ai_prediction_history
           WHERE user_id = ? AND game_slug = ? AND interval = ?
           ORDER BY LENGTH(period_id) DESC, period_id DESC
           LIMIT 1`
        )
        .get(userId, gameSlug, interval) as { period_id?: string } | undefined;
      const lastPid = String(latestRow?.period_id || '').trim();
      if (
        !lastPid ||
        !/^\d{10,32}$/.test(lastPid) ||
        lastPid.length !== targetPeriodId.length ||
        lastPid.slice(0, -4) !== targetPeriodId.slice(0, -4)
      ) {
        return;
      }

      const diff = BigInt(targetPeriodId) - BigInt(lastPid);
      if (diff < 2n || diff > 6n) return;

      const storedPool = loadStoredLiveDraws(interval, 60);
      const poolMap = new Map<string, { issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>();
      for (const item of [...availableDraws, ...storedPool]) {
        if (item?.issueNumber && !poolMap.has(item.issueNumber)) {
          poolMap.set(item.issueNumber, item);
        }
      }
      const allDrawsDesc = Array.from(poolMap.values()).sort((a, b) => {
        const d = BigInt(b.issueNumber) - BigInt(a.issueNumber);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      });

      const baseBig = BigInt(lastPid);
      for (let step = 1n; step < diff; step += 1n) {
        const midPid = (baseBig + step).toString().padStart(targetPeriodId.length, '0');
        const exists = db
          .prepare(
            `SELECT id FROM ai_prediction_history
             WHERE user_id = ? AND game_slug = ? AND interval = ? AND period_id = ? LIMIT 1`
          )
          .get(userId, gameSlug, interval, midPid);
        if (exists) continue;

        const priorDesc = allDrawsDesc
          .filter((d) => BigInt(d.issueNumber) < BigInt(midPid))
          .slice(0, 30);
        if (priorDesc.length < 6) continue;

        const midEngine = runCombinedWingoEngine(priorDesc, midPid, {
          interval,
          strategyConfig,
          fallbackPredictorMode,
        });
        const midConfusion = evaluateDrawConfusion(priorDesc, midEngine);
        const midPred = buildEngineFallbackPrediction(priorDesc, midEngine, midConfusion, interval);
        recordAiPredictionForUser(userId, gameSlug, gameName, interval, midPid, midPred);

        const settledDraw = poolMap.get(midPid);
        if (settledDraw) {
          const outcome =
            midPred.label === 'SKIP'
              ? 'SKIPPED'
              : settledDraw.actualResult === midPred.label
              ? 'WIN'
              : 'LOSS';
          db.prepare(
            `UPDATE ai_prediction_history
             SET actual_number = ?, actual_result = ?, outcome = ?
             WHERE user_id = ? AND game_slug = ? AND interval = ? AND period_id = ?`
          ).run(
            settledDraw.number,
            settledDraw.actualResult,
            outcome,
            userId,
            gameSlug,
            interval,
            midPid
          );
        }
      }
    } catch (err) {
      console.error('Backfill missed AI periods warning:', err);
    }
  }

  app.get('/api/wingo/prediction-history', requireAuth, requireActiveAiPass, (req: AuthedRequest, res) => {
    const authUser = req.user!;
    const interval = req.query.interval === '30s' || req.query.interval === '1m' ? req.query.interval : null;
    const gameSlug = typeof req.query.gameSlug === 'string' && req.query.gameSlug.trim() ? req.query.gameSlug.trim().slice(0, 80) : null;
    const limit = Math.max(5, Math.min(60, Math.round(Number(req.query.limit) || 25)));

    // Settle any pending AI predictions whose real outcome is now in wingo_live_draws
    try {
      db.prepare(
        `UPDATE ai_prediction_history
         SET actual_number = (
               SELECT d.number FROM wingo_live_draws d
               WHERE d.interval = ai_prediction_history.interval
                 AND d.issue_number = ai_prediction_history.period_id
               LIMIT 1
             ),
             actual_result = COALESCE(
               (
                 SELECT d.actual_result FROM wingo_live_draws d
                 WHERE d.interval = ai_prediction_history.interval
                   AND d.issue_number = ai_prediction_history.period_id
                 LIMIT 1
               ),
               ''
             ),
             outcome = CASE
               WHEN ai_prediction_history.signal = 'SKIP' OR ai_prediction_history.outcome = 'SKIPPED' THEN 'SKIPPED'
               WHEN EXISTS (
                 SELECT 1 FROM wingo_live_draws d
                 WHERE d.interval = ai_prediction_history.interval
                   AND d.issue_number = ai_prediction_history.period_id
                   AND d.actual_result = ai_prediction_history.signal
               ) THEN 'WIN'
               WHEN EXISTS (
                 SELECT 1 FROM wingo_live_draws d
                 WHERE d.interval = ai_prediction_history.interval
                   AND d.issue_number = ai_prediction_history.period_id
               ) THEN 'LOSS'
               ELSE 'PENDING'
             END
         WHERE user_id = ? AND (outcome = 'PENDING' OR (outcome = 'SKIPPED' AND actual_result = ''))`
      ).run(authUser.id);
    } catch (settleErr) {
      console.error('Settle prediction history warning:', settleErr);
    }

    const clauses: string[] = ['user_id = ?'];
    const params: Array<string | number> = [authUser.id];
    if (interval) {
      clauses.push('interval = ?');
      params.push(interval);
    }
    if (gameSlug) {
      clauses.push('game_slug = ?');
      params.push(gameSlug);
    }

    const whereSql = clauses.join(' AND ');
    const rows = db
      .prepare(
        `SELECT * FROM ai_prediction_history
         WHERE ${whereSql}
         ORDER BY LENGTH(period_id) DESC, period_id DESC, id DESC
         LIMIT ?`
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    const agg = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) AS losses,
           SUM(CASE WHEN outcome = 'PENDING' THEN 1 ELSE 0 END) AS pending
         FROM ai_prediction_history
         WHERE ${whereSql}`
      )
      .get(...params) as { total: number; wins: number; losses: number; pending: number };

    const settledCount = Number(agg.wins || 0) + Number(agg.losses || 0);
    const winRate = settledCount > 0 ? Math.round((Number(agg.wins || 0) / settledCount) * 100) : null;

    res.json({
      history: rows.map((r) => ({
        id: Number(r.id),
        periodId: String(r.period_id),
        interval: r.interval === '30s' ? '30s' : '1m',
        gameSlug: String(r.game_slug),
        gameName: String(r.game_name),
        signal: r.signal === 'SKIP' ? 'SKIP' : r.signal === 'SMALL' ? 'SMALL' : 'BIG',
        digit: Number(r.digit),
        color: r.color === 'GREEN' ? 'GREEN' : 'RED',
        hasViolet: Boolean(r.has_violet),
        confidence: Number(r.confidence),
        selectedStrategy: String(r.selected_strategy || ''),
        strategyTag: String(r.strategy_tag || ''),
        reasonSummary: String(r.reason_summary || ''),
        actualNumber: r.actual_number === null || r.actual_number === undefined ? null : Number(r.actual_number),
        actualResult: r.actual_result === 'BIG' || r.actual_result === 'SMALL' ? r.actual_result : null,
        outcome:
          r.outcome === 'WIN' || r.outcome === 'LOSS' || r.outcome === 'SKIPPED'
            ? r.outcome
            : 'PENDING',
        createdAt: String(r.created_at),
      })),
      stats: {
        total: Number(agg.total || 0),
        wins: Number(agg.wins || 0),
        losses: Number(agg.losses || 0),
        pending: Number(agg.pending || 0),
        winRate,
      },
    });
  });

  app.post('/api/wingo/ai-predict', requireAuth, requireActiveAiPass, async (req: AuthedRequest, res) => {
    const authUser = req.user!;
    const periodId = String(req.body?.periodId || '').trim();
    const gameSlug = String(req.body?.gameSlug || 'kwg-game').trim().slice(0, 80);
    const gameName = String(req.body?.gameName || 'Wingo 1M').trim().slice(0, 80);
    const interval: '30s' | '1m' = req.body?.interval === '30s' ? '30s' : '1m';
    const clockMode = req.body?.clockMode === 'ist-standard' ? 'ist-standard' : 'utc-partner-api';

    if (!periodId || !/^[A-Za-z0-9_-]{4,40}$/.test(periodId)) {
      res.status(400).json({ error: 'Valid target periodId is required.' });
      return;
    }

    try {
      const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
      if (!geminiApiKey) {
        res.status(422).json({
          error: 'Gemini AI predictor is not configured (GEMINI_API_KEY missing on server).',
        });
        return;
      }

      const platformCfg = serializePlatformConfig();
      const sCfg = platformCfg.strategyConfig;
      const stratKey = `${sCfg.patternBrainEnabled ? 1 : 0}${sCfg.momentumTrendEnabled ? 1 : 0}${sCfg.dragonContrarianEnabled ? 1 : 0}`;
      const cacheKey = `${periodId}:${interval}:${gameSlug}:${clockMode}:${platformCfg.predictorMode}:${stratKey}`;
      const cached = aiPeriodCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        backfillMissedAiPeriodsForUser(
          authUser.id,
          gameSlug,
          gameName,
          interval,
          periodId,
          cached.payload.recentResults || [],
          sCfg,
          platformCfg.predictorMode as PredictorMode
        );
        recordAiPredictionForUser(authUser.id, gameSlug, gameName, interval, periodId, cached.payload.prediction);
        res.json(cached.payload);
        return;
      }

      const existingInFlight = aiInFlightMap.get(cacheKey);
      if (existingInFlight) {
        try {
          const sharedResult = await existingInFlight;
          backfillMissedAiPeriodsForUser(
            authUser.id,
            gameSlug,
            gameName,
            interval,
            periodId,
            sharedResult.recentResults || [],
            sCfg,
            platformCfg.predictorMode as PredictorMode
          );
          recordAiPredictionForUser(authUser.id, gameSlug, gameName, interval, periodId, sharedResult.prediction);
          res.json(sharedResult);
          return;
        } catch {
          // fall through if shared attempt failed
        }
      }

      // 1. Fetch live results from upstream Wingo API (30 draws) and merge validated client + stored real draws strictly < periodId
      const upstreamList = await fetchUpstreamWingoResults(30, interval);
      const rawClientResults = Array.isArray(req.body?.clientResults) ? req.body.clientResults : [];
      if (rawClientResults.length > 0) {
        saveLiveDrawsToDb(interval, rawClientResults, 'client-api');
      }
      const storedLive = loadStoredLiveDraws(interval, 30);
      const mergedMap = new Map<
        string,
        { issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }
      >();

      for (const item of [...upstreamList, ...rawClientResults, ...storedLive]) {
        const issue = String(item?.issueNumber || '').trim();
        const num = Number(item?.number);
        if (!issue || !/^\d{8,32}$/.test(issue) || !Number.isInteger(num) || num < 0 || num > 9) {
          continue;
        }
        if (/^\d+$/.test(periodId)) {
          try {
            if (BigInt(issue) >= BigInt(periodId)) continue;
          } catch {
            if (issue === periodId) continue;
          }
        }
        if (!mergedMap.has(issue)) {
          mergedMap.set(issue, {
            issueNumber: issue,
            number: num,
            actualResult: num >= 5 ? 'BIG' : 'SMALL',
          });
        }
      }

      const sortedHistory = Array.from(mergedMap.values())
        .sort((a, b) => {
          if (/^\d+$/.test(a.issueNumber) && /^\d+$/.test(b.issueNumber)) {
            const diff = BigInt(b.issueNumber) - BigInt(a.issueNumber);
            return diff > 0n ? 1 : diff < 0n ? -1 : 0;
          }
          return b.issueNumber.localeCompare(a.issueNumber);
        })
        .slice(0, 30);

      if (sortedHistory.length < 6 && interval === '1m') {
        const storedActuals = db
          .prepare(
            `SELECT period_id AS issueNumber, actual_number AS number, actual_result AS actualResult
             FROM mod_menu_history
             WHERE game_slug = ? AND actual_number IS NOT NULL
             ORDER BY period_id DESC LIMIT 30`
          )
          .all(gameSlug) as Array<{ issueNumber: string; number: number; actualResult: 'BIG' | 'SMALL' }>;

        for (const item of storedActuals) {
          const issue = String(item?.issueNumber || '').trim();
          const num = Number(item?.number);
          if (!issue || !Number.isInteger(num) || num < 0 || num > 9) continue;
          if (/^\d+$/.test(periodId)) {
            try {
              if (BigInt(issue) >= BigInt(periodId)) continue;
            } catch {
              if (issue === periodId) continue;
            }
          }
          if (!mergedMap.has(issue)) {
            mergedMap.set(issue, {
              issueNumber: issue,
              number: num,
              actualResult: num >= 5 ? 'BIG' : 'SMALL',
            });
            sortedHistory.push({
              issueNumber: issue,
              number: num,
              actualResult: num >= 5 ? 'BIG' : 'SMALL',
            });
          }
        }
      }

      if (sortedHistory.length < 6) {
        res.status(422).json({
          error: `Insufficient verified historical draws for ${interval.toUpperCase()} (${sortedHistory.length}/6 loaded). Keep the game feed open briefly so live draws sync before generating an AI prediction.`,
          dataProblem: true,
          availableCount: sortedHistory.length,
        });
        return;
      }

      const apiSource = upstreamList.length > 0 ? 'live-api' : rawClientResults.length > 0 ? 'client-api' : 'stored-history';
      const recentWindow = sortedHistory.slice(0, 14);
      const newest = recentWindow[0];
      let streakLen = 1;
      for (let i = 1; i < recentWindow.length; i += 1) {
        if (recentWindow[i].actualResult === newest.actualResult) streakLen += 1;
        else break;
      }
      let flips = 0;
      const zigLen = Math.min(10, recentWindow.length - 1);
      for (let i = 0; i < zigLen; i += 1) {
        if (recentWindow[i].actualResult !== recentWindow[i + 1].actualResult) flips += 1;
      }
      const chopRatio = zigLen > 0 ? flips / zigLen : 0.5;
      const bigCount5 = sortedHistory.slice(0, 5).filter((r) => r.actualResult === 'BIG').length;
      const smallCount5 = Math.min(5, sortedHistory.length) - bigCount5;
      const bigCount10 = sortedHistory.slice(0, 10).filter((r) => r.actualResult === 'BIG').length;
      const smallCount10 = sortedHistory.slice(0, 10).length - bigCount10;
      const bigCount20 = sortedHistory.slice(0, 20).filter((r) => r.actualResult === 'BIG').length;
      const smallCount20 = sortedHistory.slice(0, 20).length - bigCount20;
      const bigCountAll = sortedHistory.filter((r) => r.actualResult === 'BIG').length;
      const smallCountAll = sortedHistory.length - bigCountAll;

      // Empirical 1st, 2nd & 3rd-order Markov transition statistics (chronological)
      const chrono = [...sortedHistory].reverse();
      let bb = 0, bs = 0, sb = 0, ss = 0;
      const latestBigram = sortedHistory.length >= 2 ? `${sortedHistory[1].actualResult[0]}${sortedHistory[0].actualResult[0]}` : '';
      const latestTrigram =
        sortedHistory.length >= 3
          ? `${sortedHistory[2].actualResult[0]}${sortedHistory[1].actualResult[0]}${sortedHistory[0].actualResult[0]}`
          : '';
      let bigramNextBig = 0, bigramNextSmall = 0;
      let trigramNextBig = 0, trigramNextSmall = 0;
      for (let i = 0; i < chrono.length - 1; i += 1) {
        const c = chrono[i].actualResult;
        const n = chrono[i + 1].actualResult;
        if (c === 'BIG' && n === 'BIG') bb += 1;
        else if (c === 'BIG' && n === 'SMALL') bs += 1;
        else if (c === 'SMALL' && n === 'BIG') sb += 1;
        else ss += 1;
        if (i >= 1 && latestBigram) {
          const bg = `${chrono[i - 1].actualResult[0]}${chrono[i].actualResult[0]}`;
          if (bg === latestBigram) {
            if (n === 'BIG') bigramNextBig += 1;
            else bigramNextSmall += 1;
          }
        }
        if (i >= 2 && latestTrigram) {
          const tg = `${chrono[i - 2].actualResult[0]}${chrono[i - 1].actualResult[0]}${chrono[i].actualResult[0]}`;
          if (tg === latestTrigram) {
            if (n === 'BIG') trigramNextBig += 1;
            else trigramNextSmall += 1;
          }
        }
      }

      let greenCount10 = 0;
      let redCount10 = 0;
      sortedHistory.slice(0, 10).forEach((r) => {
        const c = computeWingoColorMeta(r.number);
        if (c.color === 'GREEN') greenCount10 += 1;
        else redCount10 += 1;
      });

      const formattedDraws = sortedHistory
        .slice(0, 24)
        .map((r, idx) => {
          const meta = computeWingoColorMeta(r.number);
          return `${idx + 1}. Issue ${r.issueNumber}: #${r.number} (${r.actualResult}, ${meta.color}${meta.hasViolet ? '+VIOLET' : ''})`;
        })
        .join('\n');

      const digitCounts = Array.from({ length: 10 }, (_, d) => `${d}:${sortedHistory.filter((r) => r.number === d).length}`).join(' ');
      const markovStayFromNewest =
        newest.actualResult === 'BIG'
          ? bb + bs > 0
            ? bb / (bb + bs)
            : 0.5
          : sb + ss > 0
          ? ss / (sb + ss)
          : 0.5;
      const bigramTotal = bigramNextBig + bigramNextSmall;
      const trigramTotal = trigramNextBig + trigramNextSmall;

      const regimeHint =
        flips >= Math.max(6, Math.round(zigLen * 0.72))
          ? 'HIGH_CONFIDENCE_ZIGZAG'
          : streakLen >= 4
          ? 'EXTREME_STREAK_EXHAUSTION'
          : Math.abs(bigCount10 - smallCount10) >= 6
          ? 'HEAVY_IMBALANCE_REVERSION'
          : 'AUTONOMOUS_WEIGHTED_MARKOV';

      try {
        const ai = new GoogleGenAI({
          apiKey: geminiApiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const combinedEngine = runCombinedWingoEngine(sortedHistory, periodId, {
          interval,
          strategyConfig: sCfg,
          fallbackPredictorMode: platformCfg.predictorMode as PredictorMode,
        });

        const confusion = evaluateDrawConfusion(sortedHistory, combinedEngine);
        const { highConfusion, confusionScore } = confusion;

        const effectiveRegimeHint = highConfusion ? 'HIGH_CONFUSION_CHOP_WAIT' : regimeHint;
        const perf = combinedEngine.strategyPerformance;
        const contentsPayload = [
          `Target Game: ${gameName} (${gameSlug}, interval=${interval.toUpperCase()}, clock=${clockMode})`,
          `Target Period ID to Predict: ${periodId}`,
          `Configured Engine: ${sCfg.allThreeStrategiesActive ? 'ALL 3 STRATEGIES COMBINED' : platformCfg.predictorMode} | Regime: ${effectiveRegimeHint} | Confusion Risk: ${highConfusion ? `HIGH (${confusionScore}/6)` : `LOW/MODERATE (${confusionScore}/6)`}`,
          [
            `Combined 3-Strategy Engine & Walk-Forward Backtest Performance (${combinedEngine.agreementLabel} ${combinedEngine.consensusType}):`,
            `- Pattern Brain AI (${combinedEngine.strategies.patternBrain.active ? 'ACTIVE' : 'OFF'} | Walk-Forward Hit Rate: ${perf.patternBrain.hitRate ?? 'N/A'}% over ${perf.patternBrain.evaluated} rounds | Weight=${perf.patternBrain.weight}x): ${combinedEngine.strategies.patternBrain.signal} (${combinedEngine.strategies.patternBrain.confidence}%) — ${combinedEngine.strategies.patternBrain.reason}`,
            `- Momentum Trend Follow (${combinedEngine.strategies.momentumTrend.active ? 'ACTIVE' : 'OFF'} | Walk-Forward Hit Rate: ${perf.momentumTrend.hitRate ?? 'N/A'}% over ${perf.momentumTrend.evaluated} rounds | Weight=${perf.momentumTrend.weight}x): ${combinedEngine.strategies.momentumTrend.signal} (${combinedEngine.strategies.momentumTrend.confidence}%) — ${combinedEngine.strategies.momentumTrend.reason}`,
            `- Dragon Contrarian Reversal (${combinedEngine.strategies.dragonContrarian.active ? 'ACTIVE' : 'OFF'} | Walk-Forward Hit Rate: ${perf.dragonContrarian.hitRate ?? 'N/A'}% over ${perf.dragonContrarian.evaluated} rounds | Weight=${perf.dragonContrarian.weight}x): ${combinedEngine.strategies.dragonContrarian.signal} (${combinedEngine.strategies.dragonContrarian.confidence}%) — ${combinedEngine.strategies.dragonContrarian.reason}`,
            `- Autonomous Engine Preliminary Decision: ${combinedEngine.finalSignal} (Approach: ${combinedEngine.selectedApproach}, weighted score=${combinedEngine.combinedScore})`,
          ].join('\n'),
          [
            `Deep Quantitative Telemetry (${sortedHistory.length} verified draws):`,
            `- Active streak: ${streakLen}x ${newest.actualResult} | Alternation: ${flips}/${zigLen} flips (${Math.round(chopRatio * 100)}% chop)`,
            `- Multi-horizon split: last-5 (${bigCount5}B/${smallCount5}S) | last-10 (${bigCount10}B/${smallCount10}S) | last-20 (${bigCount20}B/${smallCount20}S) | all-${sortedHistory.length} (${bigCountAll}B/${smallCountAll}S)`,
            `- Empirical 1st-order Markov: B->B=${bb}, B->S=${bs}, S->B=${sb}, S->S=${ss} (Stay rate from ${newest.actualResult}: ${Math.round(markovStayFromNewest * 100)}%)`,
            `- Empirical 2nd-order bigram "${latestBigram || 'NA'}->?": BIG=${bigramNextBig}, SMALL=${bigramNextSmall} (n=${bigramTotal})`,
            `- Empirical 3rd-order trigram "${latestTrigram || 'NA'}->?": BIG=${trigramNextBig}, SMALL=${trigramNextSmall} (n=${trigramTotal})`,
            `- Last-10 Colors: GREEN=${greenCount10}, RED=${redCount10} | Digit counts: ${digitCounts}`,
          ].join('\n'),
          `Most Recent Verified Live Draws (newest first):\n${formattedDraws}`,
          [
            `ACCURACY & CAPITAL PROTECTION RULES FOR PERIOD ${periodId} (${interval.toUpperCase()}):`,
            `1. Output "BIG", "SMALL", or "SKIP". Protecting the AI PASS user's balance from confusing coin-flip rounds is MORE IMPORTANT than forcing a guess.`,
            `2. Output "SKIP" whenever signals conflict (e.g., strategies split BIG vs SMALL or NEUTRAL), last-10 BIG/SMALL is near balanced (4/6 to 6/4) with ~50% Markov stay rate and no clean zig-zag/streak, or true statistical confidence is below 64%.`,
            `3. Output "BIG" or "SMALL" ONLY when there is a real, high-conviction edge (clear consensus, >=3x streak/exhaustion, strong >=70% zig-zag, or decisive Markov/bigram skew with confidence >= 65).`,
            `4. Put the exact chosen strategy name (or "AI Confusion Guard (SKIP)" when skipping) in "selectedStrategy" and a short badge label in "strategyTag".`,
            `5. Keep reasonSummary concise (under 160 chars), clearly stating why to bet BIG/SMALL or why to SKIP & wait.`,
            `6. Set allWalletSureshot=true ONLY when all 3 strategies unanimously align AND confidence >= 90 (never when label=SKIP).`,
          ].join('\n'),
        ].join('\n\n');

        const baseConfig = {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            `You are a disciplined multi-strategy Wingo ${interval === '30s' ? '30-Second' : '1-Minute'} quantitative analyst protecting AI PASS members from low-edge rounds. Rules: BIG = digits 5,6,7,8,9; SMALL = digits 0,1,2,3,4. Colors: 1,3,7,9=GREEN; 2,4,6,8=RED; 5=GREEN+VIOLET; 0=RED+VIOLET. Evaluate Pattern Brain AI, Momentum Trend Follow, Dragon Contrarian Reversal, Markov/Bigram/Trigram frequencies, and walk-forward hit rates. Output BIG or SMALL only when a clear statistical edge exists (confidence >= 65). Whenever the board is confusing, choppy, conflicted, or near a 50/50 coin flip, output SKIP to advise waiting for the next clear setup.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, enum: ['BIG', 'SMALL', 'SKIP'] },
              number: { type: Type.INTEGER },
              confidence: { type: Type.INTEGER },
              allWalletSureshot: { type: Type.BOOLEAN },
              selectedStrategy: { type: Type.STRING },
              strategyTag: { type: Type.STRING },
              reasonSummary: { type: Type.STRING },
              sureshotNote: { type: Type.STRING },
            },
            required: [
              'label',
              'number',
              'confidence',
              'allWalletSureshot',
              'selectedStrategy',
              'strategyTag',
              'reasonSummary',
            ],
          },
        };

        const primaryTimeoutMs = interval === '30s' ? 8500 : 12000;
        const fallbackTimeoutMs = interval === '30s' ? 6000 : 8500;

        const runPredictionPromise = (async () => {
          let parsed: {
            label?: string;
            number?: number;
            confidence?: number;
            allWalletSureshot?: boolean;
            selectedStrategy?: string;
            strategyTag?: string;
            reasonSummary?: string;
            sureshotNote?: string;
          } | null = null;

          try {
            let response;
            try {
              response = await callGeminiWithTimeout(ai, {
                model: 'gemini-4-hydrogen',
                contents: contentsPayload,
                config: baseConfig,
                timeoutMs: primaryTimeoutMs,
              });
            } catch (primaryErr) {
              const errName = primaryErr instanceof Error ? primaryErr.name : '';
              const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
              const isRetryable =
                errName === 'AbortError' ||
                errName === 'TimeoutError' ||
                msg.includes('503') ||
                msg.includes('UNAVAILABLE') ||
                msg.includes('high demand') ||
                msg.includes('429') ||
                msg.includes('Timeout') ||
                msg.includes('timed out') ||
                msg.includes('aborted');
              if (!isRetryable) throw primaryErr;
              await new Promise((resolve) => setTimeout(resolve, 250));
              response = await callGeminiWithTimeout(ai, {
                model: 'gemini-3.1-flash-lite',
                contents: contentsPayload,
                config: {
                  ...baseConfig,
                  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                },
                timeoutMs: fallbackTimeoutMs,
              });
            }

            const rawText = response?.text;
            if (rawText) {
              parsed = JSON.parse(rawText);
            }
          } catch (geminiErr) {
            const errName = geminiErr instanceof Error ? geminiErr.name : '';
            const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
            const isTransientTimeoutOrLoad =
              errName === 'AbortError' ||
              errName === 'TimeoutError' ||
              /aborted|timed out|timeout|503|429|UNAVAILABLE|high demand/i.test(errMsg);
            if (!isTransientTimeoutOrLoad) {
              throw geminiErr;
            }
            console.warn(
              `Gemini AI transient fallback for period ${periodId} (${interval}): using quantitative 3-strategy continuity so history stays gap-free.`
            );
          }

          let prediction: Record<string, unknown>;
          if (!parsed) {
            prediction = buildEngineFallbackPrediction(
              sortedHistory,
              combinedEngine,
              confusion,
              interval
            );
          } else {
            const rawLabel =
              parsed.label === 'SKIP'
                ? 'SKIP'
                : parsed.label === 'SMALL'
                ? 'SMALL'
                : parsed.label === 'BIG'
                ? 'BIG'
                : combinedEngine.finalSignal === 'SMALL'
                ? 'SMALL'
                : 'BIG';

            const rawConf = Math.max(40, Math.min(94, Math.round(Number(parsed.confidence) || 64)));
            const shouldSkip =
              rawLabel === 'SKIP' ||
              rawConf < 64 ||
              (highConfusion && rawConf < 74);

            const label: 'BIG' | 'SMALL' | 'SKIP' = shouldSkip
              ? 'SKIP'
              : rawLabel === 'SMALL'
              ? 'SMALL'
              : 'BIG';

            let pickedNum = Number.isFinite(Number(parsed.number))
              ? Math.max(0, Math.min(9, Math.round(Number(parsed.number))))
              : combinedEngine.suggestedDigit;

            if (label === 'BIG' && pickedNum < 5) {
              pickedNum = pickedNum + 5;
            } else if (label === 'SMALL' && pickedNum >= 5) {
              pickedNum = pickedNum - 5;
            }

            const { color, hasViolet } = computeWingoColorMeta(pickedNum);
            const prob =
              label === 'SKIP'
                ? Math.max(35, Math.min(58, rawConf))
                : Math.max(64, Math.min(94, rawConf));
            const allWalletSureshot =
              label !== 'SKIP' &&
              combinedEngine.consensusType === 'THREE-WAY AGREEMENT' &&
              (Boolean(parsed.allWalletSureshot) || prob >= 90) &&
              prob >= 88;
            const sureshot = label !== 'SKIP' && (allWalletSureshot || prob >= 84);
            const chosenStrat =
              label === 'SKIP'
                ? 'AI Confusion Guard (SKIP)'
                : String(
                    parsed.selectedStrategy ||
                      combinedEngine.selectedApproach ||
                      'Autonomous 3-Strategy AI'
                  ).slice(0, 70);

            const skipDefaultReason = `Confusing ${bigCount10}B/${smallCount10}S chop (${Math.round(chopRatio * 100)}% flips) & split strategies — SKIP this round and wait for a clearer signal.`;

            prediction = {
              label,
              number: pickedNum,
              color,
              hasViolet,
              prob,
              sureshot,
              allWalletSureshot,
              sureshotNote: allWalletSureshot
                ? String(parsed.sureshotNote || `3/3 High-Conviction AI Lock · ${label}`).slice(0, 90)
                : undefined,
              source: 'gemini-ai' as const,
              selectedStrategy: chosenStrat,
              dataProblem: false,
              strategyTag:
                label === 'SKIP'
                  ? 'AI SKIP GUARD · WAIT'
                  : String(parsed.strategyTag || `${combinedEngine.agreementLabel} ${chosenStrat}`).slice(0, 56),
              reasonSummary: String(
                label === 'SKIP'
                  ? rawLabel === 'SKIP' && parsed.reasonSummary
                    ? parsed.reasonSummary
                    : skipDefaultReason
                  : parsed.reasonSummary ||
                      combinedEngine.summaryReason ||
                      `Gemini AI analyzed ${sortedHistory.length} live draws.`
              ).slice(0, 220),
              analyzedCount: sortedHistory.length,
              interval,
              combinedAnalysis: combinedEngine,
              lastResultsPreview: sortedHistory.slice(0, 5).map((r) => ({
                issueShort: r.issueNumber.slice(-4),
                number: r.number,
                actualResult: r.actualResult,
                color: computeWingoColorMeta(r.number).color,
              })),
            };
          }

          const resultPayload = {
            prediction,
            recentResults: sortedHistory,
            apiSource,
          };
          aiPeriodCache.set(cacheKey, {
            expiresAt: Date.now() + 90_000,
            payload: resultPayload,
          });
          if (aiPeriodCache.size > 40) {
            const oldestKey = aiPeriodCache.keys().next().value;
            if (oldestKey) aiPeriodCache.delete(oldestKey);
          }
          return resultPayload;
        })();

        aiInFlightMap.set(cacheKey, runPredictionPromise);
        try {
          const resultPayload = await runPredictionPromise;
          backfillMissedAiPeriodsForUser(
            authUser.id,
            gameSlug,
            gameName,
            interval,
            periodId,
            sortedHistory,
            sCfg,
            platformCfg.predictorMode as PredictorMode
          );
          recordAiPredictionForUser(authUser.id, gameSlug, gameName, interval, periodId, resultPayload.prediction);
          res.json(resultPayload);
        } finally {
          aiInFlightMap.delete(cacheKey);
        }
      } catch (err) {
        const errName = err instanceof Error ? err.name : '';
        let friendly = err instanceof Error ? err.message : 'Gemini AI prediction service failed.';
        const isAbortOrTimeout =
          errName === 'AbortError' ||
          errName === 'TimeoutError' ||
          /aborted|timed out|timeout/i.test(friendly);
        if (isAbortOrTimeout) {
          console.warn(`Gemini AI prediction timed out for period ${periodId}; returning retry notice.`);
          res.status(422).json({
            error: 'Gemini AI response timed out under high network load. Please tap Active Gemini AI to retry.',
          });
          return;
        }
        console.error('Gemini AI Wingo prediction error:', err);
        try {
          const parsedErr = JSON.parse(friendly);
          if (parsedErr?.error?.message) friendly = String(parsedErr.error.message);
        } catch {
          // plain string message
        }
        res.status(422).json({
          error: friendly,
        });
      }
    } catch (outerErr) {
      console.error('Wingo AI route error:', outerErr);
      res.status(422).json({ error: 'Gemini AI predictor is momentarily busy. Please retry.' });
    }
  });

  app.post('/api/predictions/unlock', requireAuth, (req: AuthedRequest, res) => {
    const feature =
      req.body?.feature === 'number'
        ? 'number'
        : req.body?.feature === 'color'
        ? 'color'
        : req.body?.feature === 'ai'
        ? 'ai'
        : null;

    if (!feature) {
      res.status(400).json({ error: 'Select ai, number, or color prediction feature to unlock.' });
      return;
    }

    const cfg = serializePlatformConfig();
    if (feature === 'number' && !cfg.numberPredEnabled) {
      res.status(403).json({ error: 'Number prediction unlocks are currently paused by the administrator.' });
      return;
    }
    if (feature === 'color' && !cfg.colorPredEnabled) {
      res.status(403).json({ error: 'Color prediction unlocks are currently paused by the administrator.' });
      return;
    }
    if (feature === 'ai' && !cfg.aiPredEnabled) {
      res.status(403).json({ error: 'Gemini AI unlocks are currently paused by the administrator.' });
      return;
    }

    let hours = 24;
    let cost = 0;
    let featureLabel = '';
    let colName = 'number_pred_expires_at';

    if (feature === 'ai') {
      const planId = String(req.body?.planId || '').trim();
      const aiPlanMap: Record<string, { hours: number; price: number; label: string }> = {
        weekly: { hours: 168, price: cfg.aiWeeklyPrice, label: 'Gemini AI Weekly Pass (7 Days)' },
        '15days': { hours: 360, price: cfg.ai15DaysPrice, label: 'Gemini AI 15-Day Pass' },
        monthly: { hours: 720, price: cfg.aiMonthlyPrice, label: 'Gemini AI Monthly Pass (30 Days)' },
        yearly: { hours: 8760, price: cfg.aiYearlyPrice, label: 'Gemini AI Yearly VIP Pass (365 Days)' },
      };
      const selectedPlan = aiPlanMap[planId];
      if (!selectedPlan) {
        res.status(400).json({ error: 'Select a valid Gemini AI plan (weekly, 15days, monthly, or yearly).' });
        return;
      }
      hours = selectedPlan.hours;
      cost = roundMoney(selectedPlan.price);
      featureLabel = selectedPlan.label;
      colName = 'ai_pred_expires_at';
    } else {
      const defaultHours = feature === 'number' ? cfg.numberPredHours : cfg.colorPredHours;
      const rawHours = Number(req.body?.hours ?? defaultHours);
      hours = Math.round(rawHours);

      if (
        !Number.isFinite(hours) ||
        hours < cfg.minUnlockHours ||
        hours > cfg.maxUnlockHours
      ) {
        res.status(400).json({
          error: `Duration must be between ${cfg.minUnlockHours} and ${cfg.maxUnlockHours} hours.`,
        });
        return;
      }

      const baseRate = feature === 'number' ? cfg.numberPredPrice : cfg.colorPredPrice;
      const baseHours = feature === 'number' ? cfg.numberPredHours : cfg.colorPredHours;
      cost =
        baseRate <= 0
          ? 0
          : Math.max(1, roundMoney((hours / Math.max(1, baseHours)) * baseRate));
      featureLabel = feature === 'number' ? 'Number Prediction' : 'Color Prediction';
      colName = feature === 'number' ? 'number_pred_expires_at' : 'color_pred_expires_at';
    }

    try {
      db.exec('BEGIN IMMEDIATE');
      const userRow = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(req.user!.id) as unknown as DbUser | undefined;
      if (!userRow) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const currentBal = roundMoney(userRow.wallet_balance);
      if (currentBal < cost) {
        db.exec('ROLLBACK');
        res.status(400).json({
          error: `Insufficient wallet coins. Need ₹${cost.toFixed(2)} to unlock ${featureLabel} (you have ₹${currentBal.toFixed(2)}). Please deposit funds first.`,
          insufficientFunds: true,
          requiredAmount: cost,
          currentBalance: currentBal,
        });
        return;
      }

      const nowMs = Date.now();
      const existingIso =
        feature === 'ai'
          ? userRow.ai_pred_expires_at
          : feature === 'number'
          ? userRow.number_pred_expires_at
          : userRow.color_pred_expires_at;
      const existingMs = existingIso ? Date.parse(existingIso) : 0;
      const baseMs = !Number.isNaN(existingMs) && existingMs > nowMs ? existingMs : nowMs;
      const newExpiresAt = new Date(baseMs + hours * 3600 * 1000).toISOString();
      const newBal = roundMoney(currentBal - cost);
      const ts = nowIso();
      const refId = `PRD-${Date.now().toString().slice(-6)}`;

      db.prepare(`UPDATE users SET wallet_balance = ?, ${colName} = ? WHERE id = ?`).run(
        newBal,
        newExpiresAt,
        userRow.id
      );

      db.prepare(
        `INSERT INTO prediction_purchases (user_id, feature, hours, amount, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(userRow.id, feature, hours, cost, newExpiresAt, ts);

      db.prepare(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
         VALUES (?, 'prediction_unlock', ?, ?, ?, ?, ?)`
      ).run(
        userRow.id,
        -cost,
        newBal,
        `Unlocked ${featureLabel}`,
        refId,
        ts
      );

      logActivity({
        userId: userRow.id,
        category: 'game',
        title: `Unlocked ${featureLabel}`,
        details: `Reference ${refId} · Active until ${newExpiresAt}. Updated balance: ₹${newBal.toFixed(2)}.`,
        amount: -cost,
        status: 'Completed',
        createdAt: ts,
      });

      db.exec('COMMIT');
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id) as unknown as DbUser;
      res.json({
        user: serializeUser(updated),
        chargedAmount: cost,
        expiresAt: newExpiresAt,
      });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Prediction unlock error:', err);
      res.status(500).json({ error: 'Failed to unlock prediction feature.' });
    }
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const period = String(req.query.period || 'today');
    const range = getPeriodRange(period);

    const userCounts = db
      .prepare(
        `SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
          SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS bannedUsers,
          COALESCE(SUM(wallet_balance), 0) AS totalWalletBalance
         FROM users`
      )
      .get() as {
      totalUsers: number;
      activeUsers: number;
      bannedUsers: number;
      totalWalletBalance: number;
    };

    const allDeposits = db
      .prepare(
        `SELECT
          COUNT(*) AS totalCount,
          COALESCE(SUM(amount), 0) AS totalAmount,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS approvedCount,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS approvedAmount,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pendingAmount,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount,
          COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) AS rejectedAmount
         FROM deposits`
      )
      .get() as Record<string, number>;

    const periodDeposits = db
      .prepare(
        `SELECT
          COUNT(*) AS totalCount,
          COALESCE(SUM(amount), 0) AS totalAmount,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS approvedCount,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS approvedAmount,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pendingAmount,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount,
          COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) AS rejectedAmount
         FROM deposits
         WHERE created_at >= ? AND created_at <= ?`
      )
      .get(range.start, range.end) as Record<string, number>;

    const periodUsers = db
      .prepare('SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at <= ?')
      .get(range.start, range.end) as { count: number };

    const allLedger = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type IN ('game_purchase', 'prediction_unlock') THEN ABS(amount) ELSE 0 END), 0) AS gameRevenue,
          COALESCE(SUM(CASE WHEN type = 'admin_credit' THEN amount ELSE 0 END), 0) AS adminCredits,
          COALESCE(SUM(CASE WHEN type = 'admin_debit' THEN ABS(amount) ELSE 0 END), 0) AS adminDebits
         FROM wallet_transactions`
      )
      .get() as { gameRevenue: number; adminCredits: number; adminDebits: number };

    const periodLedger = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type IN ('game_purchase', 'prediction_unlock') THEN ABS(amount) ELSE 0 END), 0) AS gameRevenue,
          COALESCE(SUM(CASE WHEN type = 'admin_credit' THEN amount ELSE 0 END), 0) AS adminCredits,
          COALESCE(SUM(CASE WHEN type = 'admin_debit' THEN ABS(amount) ELSE 0 END), 0) AS adminDebits
         FROM wallet_transactions
         WHERE created_at >= ? AND created_at <= ?`
      )
      .get(range.start, range.end) as { gameRevenue: number; adminCredits: number; adminDebits: number };

    const allProfitLoss = roundMoney(allDeposits.approvedAmount + allLedger.gameRevenue - allLedger.adminCredits);
    const periodProfitLoss = roundMoney(
      periodDeposits.approvedAmount + periodLedger.gameRevenue - periodLedger.adminCredits
    );

    res.json({
      period,
      periodLabel: range.label,
      overall: {
        totalUsers: userCounts.totalUsers || 0,
        activeUsers: userCounts.activeUsers || 0,
        bannedUsers: userCounts.bannedUsers || 0,
        totalWalletBalance: roundMoney(userCounts.totalWalletBalance || 0),
        totalDepositsCount: allDeposits.totalCount || 0,
        totalDepositsAmount: roundMoney(allDeposits.totalAmount || 0),
        approvedDepositsCount: allDeposits.approvedCount || 0,
        approvedDepositsAmount: roundMoney(allDeposits.approvedAmount || 0),
        pendingDepositsCount: allDeposits.pendingCount || 0,
        pendingDepositsAmount: roundMoney(allDeposits.pendingAmount || 0),
        rejectedDepositsCount: allDeposits.rejectedCount || 0,
        rejectedDepositsAmount: roundMoney(allDeposits.rejectedAmount || 0),
        paidGameRevenue: roundMoney(allLedger.gameRevenue || 0),
        profitLoss: allProfitLoss,
      },
      periodStats: {
        newUsers: periodUsers.count || 0,
        totalDepositsCount: periodDeposits.totalCount || 0,
        totalDepositsAmount: roundMoney(periodDeposits.totalAmount || 0),
        approvedDepositsCount: periodDeposits.approvedCount || 0,
        approvedDepositsAmount: roundMoney(periodDeposits.approvedAmount || 0),
        pendingDepositsCount: periodDeposits.pendingCount || 0,
        pendingDepositsAmount: roundMoney(periodDeposits.pendingAmount || 0),
        rejectedDepositsCount: periodDeposits.rejectedCount || 0,
        rejectedDepositsAmount: roundMoney(periodDeposits.rejectedAmount || 0),
        paidGameRevenue: roundMoney(periodLedger.gameRevenue || 0),
        adminCredits: roundMoney(periodLedger.adminCredits || 0),
        adminDebits: roundMoney(periodLedger.adminDebits || 0),
        profitLoss: periodProfitLoss,
      },
    });
  });

  app.get('/api/admin/ban-notices', requireAdmin, (_req, res) => {
    res.json({ notices: PREFILLED_BAN_NOTICES });
  });

  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim();
    const aiFilter =
      req.query.aiFilter === 'active'
        ? 'active'
        : req.query.aiFilter === 'expired'
        ? 'expired'
        : 'all';

    let allUsers = db.prepare('SELECT * FROM users ORDER BY id DESC').all() as unknown as DbUser[];
    const nowMs = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    let freeCount = 0;
    for (const u of allUsers) {
      if (isUserAiPassActive(u, nowMs)) {
        activeCount += 1;
      } else if (u.ai_pred_expires_at) {
        expiredCount += 1;
      } else {
        freeCount += 1;
      }
    }

    if (q) {
      const qLower = q.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          u.uid.toLowerCase().includes(qLower) ||
          u.username.toLowerCase().includes(qLower) ||
          u.phone.toLowerCase().includes(qLower) ||
          u.email.toLowerCase().includes(qLower)
      );
    }

    if (aiFilter === 'active') {
      allUsers = allUsers.filter((u) => isUserAiPassActive(u, nowMs));
    } else if (aiFilter === 'expired') {
      allUsers = allUsers.filter((u) => !isUserAiPassActive(u, nowMs));
    }

    res.json({
      users: allUsers.map(serializeUser),
      aiPassStats: {
        activeCount,
        expiredCount,
        freeCount,
        totalUsers: activeCount + expiredCount + freeCount,
      },
    });
  });

  app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const deposits = db
      .prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 25')
      .all(userId);
    const transactions = db
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 25')
      .all(userId);
    const history = db
      .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 40')
      .all(userId);

    res.json({
      user: serializeUser(user),
      deposits,
      transactions,
      history,
    });
  });

  app.post('/api/admin/users/:id/wallet', requireAdmin, (req: AuthedRequest, res) => {
    const userId = Number(req.params.id);
    const action = req.body?.action === 'debit' ? 'debit' : 'credit';
    const amount = roundMoney(Number(req.body?.amount));
    const note = String(req.body?.note || '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Enter a valid positive amount.' });
      return;
    }

    try {
      db.exec('BEGIN IMMEDIATE');
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
      if (!target) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const currentBal = roundMoney(target.wallet_balance);
      if (action === 'debit' && currentBal < amount) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: `Cannot deduct ₹${amount.toFixed(2)}. User wallet balance is ₹${currentBal.toFixed(2)}.` });
        return;
      }

      const delta = action === 'credit' ? amount : -amount;
      const newBalance = roundMoney(currentBal + delta);
      const ts = nowIso();
      const refId = `ADM-${Date.now().toString().slice(-6)}`;

      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, userId);

      db.prepare(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        action === 'credit' ? 'admin_credit' : 'admin_debit',
        delta,
        newBalance,
        note || (action === 'credit' ? 'Admin wallet credit' : 'Admin wallet deduction'),
        refId,
        ts
      );

      logActivity({
        userId,
        category: 'wallet',
        title: action === 'credit' ? 'Wallet Credited by Admin' : 'Wallet Deducted by Admin',
        details: `Reference ${refId}. Updated balance: ₹${newBalance.toFixed(2)}.`,
        adminNotice: note,
        amount: delta,
        status: 'Completed',
        createdAt: ts,
      });

      db.exec('COMMIT');
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
      res.json({ user: serializeUser(updated) });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Admin wallet error:', err);
      res.status(500).json({ error: 'Failed to update wallet balance.' });
    }
  });

  app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
    try {
      const userId = Number(req.params.id);
      const reason = String(req.body?.reason || '').trim();
      const notice = String(req.body?.notice || '').trim();
      const rawDurationHours = req.body?.durationHours;
      const isPermanent = req.body?.isPermanent !== false && (rawDurationHours === null || rawDurationHours === undefined || rawDurationHours === '' || Number(rawDurationHours) <= 0);

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (target.phone === ADMIN_PHONE) {
        res.status(400).json({ error: 'Cannot ban the primary administrator account.' });
        return;
      }
      if (!reason || !notice) {
        res.status(400).json({ error: 'Ban reason and notice message are required.' });
        return;
      }

      let banExpiresAt: string | null = null;
      if (!isPermanent) {
        const hrs = Number(rawDurationHours);
        if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 87600) {
          res.status(400).json({ error: 'Enter a valid custom ban duration in hours (up to 87600).' });
          return;
        }
        banExpiresAt = new Date(Date.now() + hrs * 3600 * 1000).toISOString();
      }

      const ts = nowIso();
      db.prepare(
        `UPDATE users SET status = 'banned', ban_reason = ?, ban_notice = ?, banned_at = ?, ban_expires_at = ? WHERE id = ?`
      ).run(reason, notice, ts, banExpiresAt, userId);

      // Keep active session rows intact until requireAuth detects status='banned',
      // ensuring the logged-in user sees the exact ban reason & notice immediately instead of a generic 401.

      logActivity({
        userId,
        category: 'ban',
        title: `Account Suspended · ${reason}`,
        details: banExpiresAt
          ? `Timed suspension active until ${banExpiresAt}.`
          : 'Permanent account restriction issued by administrator.',
        adminNotice: notice,
        status: 'Banned',
        createdAt: ts,
      });

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
      res.json({ user: serializeUser(updated) });
    } catch (err) {
      console.error('Admin ban error:', err);
      res.status(500).json({ error: 'Failed to ban user account.' });
    }
  });

  app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
    try {
      const userId = Number(req.params.id);
      const note = String(req.body?.note || '').trim();

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      db.prepare(
        `UPDATE users SET status = 'active', ban_reason = NULL, ban_notice = NULL, banned_at = NULL, ban_expires_at = NULL, device_ban_exempt = 1 WHERE id = ?`
      ).run(userId);

      logActivity({
        userId,
        category: 'ban',
        title: 'Account Restored (Unbanned)',
        details: 'Administrator lifted the suspension on your account.',
        adminNotice: note,
        status: 'Active',
      });

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
      res.json({ user: serializeUser(updated) });
    } catch (err) {
      console.error('Admin unban error:', err);
      res.status(500).json({ error: 'Failed to unban user account.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAdmin, (req: AuthedRequest, res) => {
    try {
      const userId = Number(req.params.id);
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (target.phone === ADMIN_PHONE || target.id === req.user?.id) {
        res.status(400).json({ error: 'Cannot delete the primary administrator account.' });
        return;
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      res.json({ deletedUserId: userId, deletedUid: target.uid });
    } catch (err) {
      console.error('Delete user error:', err);
      res.status(500).json({ error: 'Failed to delete user account.' });
    }
  });

  app.get('/api/admin/deposits', requireAdmin, (req, res) => {
    const status = String(req.query.status || 'all');
    let rows;
    if (status && status !== 'all') {
      rows = db
        .prepare(
          `SELECT d.*, u.uid AS user_uid, u.username AS user_name, u.phone AS user_phone
           FROM deposits d
           JOIN users u ON u.id = d.user_id
           WHERE d.status = ?
           ORDER BY d.id DESC`
        )
        .all(status);
    } else {
      rows = db
        .prepare(
          `SELECT d.*, u.uid AS user_uid, u.username AS user_name, u.phone AS user_phone
           FROM deposits d
           JOIN users u ON u.id = d.user_id
           ORDER BY d.id DESC`
        )
        .all();
    }
    res.json({ deposits: rows });
  });

  app.post('/api/admin/deposits/:id/review', requireAdmin, (req: AuthedRequest, res) => {
    const depositId = Number(req.params.id);
    const decision =
      req.body?.decision === 'completed'
        ? 'completed'
        : req.body?.decision === 'rejected'
        ? 'rejected'
        : req.body?.decision === 'custom'
        ? 'custom'
        : null;
    const customStatus = String(req.body?.customStatus || '').trim().slice(0, 60);
    const adminNotice = String(req.body?.adminNotice || '').trim().slice(0, 280);

    if (!decision) {
      res.status(400).json({ error: 'Decision must be completed, rejected, or custom.' });
      return;
    }
    if (decision === 'custom' && !customStatus) {
      res.status(400).json({ error: 'Enter custom status text to update this deposit.' });
      return;
    }

    try {
      db.exec('BEGIN IMMEDIATE');
      const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId) as
        | {
            id: number;
            reference_id: string;
            user_id: number;
            amount: number;
            utr: string;
            upi_id: string;
            status: string;
            custom_status: string;
          }
        | undefined;

      if (!deposit) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Deposit record not found.' });
        return;
      }

      const ts = nowIso();

      if (decision === 'custom') {
        db.prepare(
          `UPDATE deposits SET custom_status = ?, admin_notice = COALESCE(NULLIF(?, ''), admin_notice), reviewed_by = ?, reviewed_at = ? WHERE id = ?`
        ).run(customStatus, adminNotice, req.user!.uid, ts, depositId);

        logActivity({
          userId: deposit.user_id,
          category: 'deposit',
          title: `Deposit Status Updated · ${deposit.reference_id}`,
          details: `UTR ${deposit.utr} status updated to "${customStatus}".`,
          adminNotice,
          amount: deposit.amount,
          status: customStatus,
          createdAt: ts,
        });

        db.exec('COMMIT');
        const updated = db
          .prepare(
            `SELECT d.*, u.uid AS user_uid, u.username AS user_name, u.phone AS user_phone
             FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
          )
          .get(depositId);
        res.json({ deposit: updated });
        return;
      }

      if (deposit.status !== 'pending') {
        db.exec('ROLLBACK');
        res.status(400).json({ error: `Deposit is already marked ${deposit.status}. Use Custom Status to edit its status text.` });
        return;
      }

      const finalStatusLabel = customStatus || (decision === 'completed' ? 'Completed' : 'Rejected');
      db.prepare(
        `UPDATE deposits SET status = ?, custom_status = ?, admin_notice = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`
      ).run(decision, finalStatusLabel, adminNotice, req.user!.uid, ts, depositId);

      if (decision === 'completed') {
        const target = db
          .prepare('SELECT wallet_balance FROM users WHERE id = ?')
          .get(deposit.user_id) as { wallet_balance: number };
        const newBal = roundMoney(target.wallet_balance + deposit.amount);

        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBal, deposit.user_id);

        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
           VALUES (?, 'deposit_credit', ?, ?, ?, ?, ?)`
        ).run(
          deposit.user_id,
          deposit.amount,
          newBal,
          `Approved UPI Deposit (${deposit.reference_id})`,
          deposit.reference_id,
          ts
        );

        logActivity({
          userId: deposit.user_id,
          category: 'deposit',
          title: `Deposit Approved · ${deposit.reference_id}`,
          details: `Verified UTR ${deposit.utr}. Credited ₹${deposit.amount.toFixed(2)} to wallet. New balance: ₹${newBal.toFixed(2)}.`,
          adminNotice,
          amount: deposit.amount,
          status: finalStatusLabel,
          createdAt: ts,
        });
      } else {
        logActivity({
          userId: deposit.user_id,
          category: 'deposit',
          title: `Deposit Rejected · ${deposit.reference_id}`,
          details: `UTR ${deposit.utr} could not be verified.`,
          adminNotice,
          amount: deposit.amount,
          status: finalStatusLabel,
          createdAt: ts,
        });
      }

      db.exec('COMMIT');
      const updated = db
        .prepare(
          `SELECT d.*, u.uid AS user_uid, u.username AS user_name, u.phone AS user_phone
           FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
        )
        .get(depositId);
      res.json({ deposit: updated });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Review deposit error:', err);
      res.status(500).json({ error: 'Failed to review deposit.' });
    }
  });

  app.get('/api/admin/payment-settings', requireAdmin, (_req, res) => {
    const settings = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get() as {
      upi_id: string;
      payee_name: string;
      instructions: string;
      deposits_enabled: number;
      min_deposit: number;
      max_deposit: number;
      updated_at: string;
    };
    res.json({
      settings: {
        upiId: settings.upi_id,
        payeeName: settings.payee_name,
        instructions: settings.instructions,
        depositsEnabled: Boolean(settings.deposits_enabled),
        minDeposit: roundMoney(settings.min_deposit),
        maxDeposit: roundMoney(settings.max_deposit),
        updatedAt: settings.updated_at,
      },
    });
  });

  app.put('/api/admin/payment-settings', requireAdmin, (req, res) => {
    const upiId = String(req.body?.upiId || '').trim();
    const payeeName = String(req.body?.payeeName || '').trim();
    const instructions = String(req.body?.instructions || '').trim();
    const depositsEnabled = req.body?.depositsEnabled ? 1 : 0;
    const minDeposit = roundMoney(Number(req.body?.minDeposit));
    const maxDeposit = roundMoney(Number(req.body?.maxDeposit));

    if (!upiId || !upiId.includes('@')) {
      res.status(400).json({ error: 'Enter a valid UPI ID (e.g., merchant@upi).' });
      return;
    }
    if (!payeeName) {
      res.status(400).json({ error: 'Payee / Merchant name is required.' });
      return;
    }
    if (!Number.isFinite(minDeposit) || minDeposit < 1 || !Number.isFinite(maxDeposit) || maxDeposit < minDeposit) {
      res.status(400).json({ error: 'Enter valid minimum and maximum deposit limits.' });
      return;
    }

    const ts = nowIso();
    db.prepare(
      `UPDATE payment_settings
       SET upi_id = ?, payee_name = ?, instructions = ?, deposits_enabled = ?, min_deposit = ?, max_deposit = ?, updated_at = ?
       WHERE id = 1`
    ).run(upiId, payeeName, instructions, depositsEnabled, minDeposit, maxDeposit, ts);

    res.json({
      settings: {
        upiId,
        payeeName,
        instructions,
        depositsEnabled: Boolean(depositsEnabled),
        minDeposit,
        maxDeposit,
        updatedAt: ts,
      },
    });
  });

  app.get('/api/admin/platform-settings', requireAdmin, (_req, res) => {
    res.json({ config: serializePlatformConfig() });
  });

  app.put('/api/admin/platform-settings', requireAdmin, (req, res) => {
    try {
    const brandName = String(req.body?.brandName || '').trim().slice(0, 60) || 'KWG Arena';
    const tagline =
      String(req.body?.tagline || '').trim().slice(0, 140) ||
      'VIP Gaming Vault & Smart Wingo Predictor';
    const announcementText = String(req.body?.announcementText || '').trim().slice(0, 280);
    const announcementEnabled = req.body?.announcementEnabled ? 1 : 0;
    const supportUrlRaw = String(req.body?.supportUrl || '').trim();
    const supportUrl = supportUrlRaw ? normalizeSupportUrl(supportUrlRaw) : '';
    if (supportUrlRaw && supportUrl === null) {
      res.status(400).json({
        error: 'Enter a valid Telegram handle (@username), t.me/link, or https:// URL.',
      });
      return;
    }
    const registrationsEnabled = req.body?.registrationsEnabled === false ? 0 : 1;
    const maintenanceMode = req.body?.maintenanceMode ? 1 : 0;
    const maintenanceMessage =
      String(req.body?.maintenanceMessage || '').trim().slice(0, 240) ||
      'Platform maintenance is underway. Back online shortly.';
    const welcomeBonus = Math.max(0, roundMoney(Number(req.body?.welcomeBonus ?? 0)));
    const numberPredPrice = Math.max(0, roundMoney(Number(req.body?.numberPredPrice ?? 20)));
    const numberPredHours = Math.max(1, Math.min(8760, Math.round(Number(req.body?.numberPredHours ?? 24))));
    const numberPredEnabled = req.body?.numberPredEnabled === false ? 0 : 1;
    const colorPredPrice = Math.max(0, roundMoney(Number(req.body?.colorPredPrice ?? 10)));
    const colorPredHours = Math.max(1, Math.min(8760, Math.round(Number(req.body?.colorPredHours ?? 48))));
    const colorPredEnabled = req.body?.colorPredEnabled === false ? 0 : 1;
    const minUnlockHours = Math.max(1, Math.min(720, Math.round(Number(req.body?.minUnlockHours ?? 1))));
    const maxUnlockHours = Math.max(
      minUnlockHours,
      Math.min(8760, Math.round(Number(req.body?.maxUnlockHours ?? 720)))
    );
    const aiWeeklyPrice = Math.max(0, roundMoney(Number(req.body?.aiWeeklyPrice ?? 101)));
    const ai15DaysPrice = Math.max(0, roundMoney(Number(req.body?.ai15DaysPrice ?? 250)));
    const aiMonthlyPrice = Math.max(0, roundMoney(Number(req.body?.aiMonthlyPrice ?? 499)));
    const aiYearlyPrice = Math.max(0, roundMoney(Number(req.body?.aiYearlyPrice ?? 1199)));
    const aiPredEnabled = req.body?.aiPredEnabled === false ? 0 : 1;
    const predictorMode =
      req.body?.predictorMode === 'trend-follow' || req.body?.predictorMode === 'contrarian'
        ? req.body.predictorMode
        : 'pattern-ai';

    const incomingStrat = req.body?.strategyConfig;
    const currentCfg = serializePlatformConfig();
    const resolvedStrat = normalizeStrategyConfig(
      incomingStrat || {
        patternBrainEnabled: predictorMode === 'pattern-ai' || currentCfg.strategyConfig.patternBrainEnabled,
        momentumTrendEnabled: predictorMode === 'trend-follow' || currentCfg.strategyConfig.momentumTrendEnabled,
        dragonContrarianEnabled: predictorMode === 'contrarian' || currentCfg.strategyConfig.dragonContrarianEnabled,
        allThreeStrategiesActive: currentCfg.strategyConfig.allThreeStrategiesActive,
      },
      predictorMode
    );

    if (
      !Number.isFinite(welcomeBonus) ||
      !Number.isFinite(numberPredPrice) ||
      !Number.isFinite(colorPredPrice) ||
      !Number.isFinite(aiWeeklyPrice) ||
      !Number.isFinite(ai15DaysPrice) ||
      !Number.isFinite(aiMonthlyPrice) ||
      !Number.isFinite(aiYearlyPrice)
    ) {
      res.status(400).json({ error: 'Enter valid numeric amounts for pricing and bonus fields.' });
      return;
    }

    const ts = nowIso();
    db.prepare(
      `UPDATE platform_settings
       SET brand_name = ?, tagline = ?, announcement_text = ?, announcement_enabled = ?, support_url = ?,
           registrations_enabled = ?, maintenance_mode = ?, maintenance_message = ?, welcome_bonus = ?,
           number_pred_price = ?, number_pred_hours = ?, number_pred_enabled = ?,
           color_pred_price = ?, color_pred_hours = ?, color_pred_enabled = ?,
           min_unlock_hours = ?, max_unlock_hours = ?,
           ai_weekly_price = ?, ai_15days_price = ?, ai_monthly_price = ?, ai_yearly_price = ?, ai_pred_enabled = ?,
           predictor_mode = ?,
           strategy_pattern_enabled = ?, strategy_momentum_enabled = ?, strategy_contrarian_enabled = ?, strategy_all_three_enabled = ?,
           updated_at = ?
       WHERE id = 1`
    ).run(
      brandName,
      tagline,
      announcementText,
      announcementEnabled,
      supportUrl,
      registrationsEnabled,
      maintenanceMode,
      maintenanceMessage,
      welcomeBonus,
      numberPredPrice,
      numberPredHours,
      numberPredEnabled,
      colorPredPrice,
      colorPredHours,
      colorPredEnabled,
      minUnlockHours,
      maxUnlockHours,
      aiWeeklyPrice,
      ai15DaysPrice,
      aiMonthlyPrice,
      aiYearlyPrice,
      aiPredEnabled,
      predictorMode,
      resolvedStrat.patternBrainEnabled ? 1 : 0,
      resolvedStrat.momentumTrendEnabled ? 1 : 0,
      resolvedStrat.dragonContrarianEnabled ? 1 : 0,
      resolvedStrat.allThreeStrategiesActive ? 1 : 0,
      ts
    );

    res.json({ config: serializePlatformConfig() });
    } catch (err) {
      console.error('Update platform settings error:', err);
      res.status(500).json({ error: 'Failed to save platform controls.' });
    }
  });

  app.put('/api/admin/ai-strategies', requireAdmin, (req, res) => {
    try {
      const hasIndividualFlags =
        req.body?.patternBrainEnabled !== undefined ||
        req.body?.momentumTrendEnabled !== undefined ||
        req.body?.dragonContrarianEnabled !== undefined;
      const masterOnly = !hasIndividualFlags && typeof req.body?.allThreeStrategiesActive === 'boolean';
      const patternBrainEnabled = masterOnly
        ? Boolean(req.body.allThreeStrategiesActive)
        : Boolean(req.body?.patternBrainEnabled);
      const momentumTrendEnabled = masterOnly
        ? Boolean(req.body.allThreeStrategiesActive)
        : Boolean(req.body?.momentumTrendEnabled);
      const dragonContrarianEnabled = masterOnly
        ? Boolean(req.body.allThreeStrategiesActive)
        : Boolean(req.body?.dragonContrarianEnabled);
      const allThreeStrategiesActive =
        patternBrainEnabled && momentumTrendEnabled && dragonContrarianEnabled;
      const primaryMode = patternBrainEnabled
        ? 'pattern-ai'
        : momentumTrendEnabled
        ? 'trend-follow'
        : dragonContrarianEnabled
        ? 'contrarian'
        : 'pattern-ai';
      const ts = nowIso();
      db.prepare(
        `UPDATE platform_settings
         SET predictor_mode = ?,
             strategy_pattern_enabled = ?,
             strategy_momentum_enabled = ?,
             strategy_contrarian_enabled = ?,
             strategy_all_three_enabled = ?,
             updated_at = ?
         WHERE id = 1`
      ).run(
        primaryMode,
        patternBrainEnabled ? 1 : 0,
        momentumTrendEnabled ? 1 : 0,
        dragonContrarianEnabled ? 1 : 0,
        allThreeStrategiesActive ? 1 : 0,
        ts
      );
      res.json({ config: serializePlatformConfig() });
    } catch (err) {
      console.error('Update AI strategies error:', err);
      res.status(500).json({ error: 'Failed to update AI strategy configuration.' });
    }
  });

  app.post('/api/admin/users/:id/prediction-pass', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const feature =
      req.body?.feature === 'number'
        ? 'number'
        : req.body?.feature === 'color'
        ? 'color'
        : req.body?.feature === 'ai'
        ? 'ai'
        : null;
    const action =
      req.body?.action === 'revoke'
        ? 'revoke'
        : req.body?.action === 'set_expiry'
        ? 'set_expiry'
        : 'grant';
    const hours = Math.max(1, Math.min(87600, Math.round(Number(req.body?.hours ?? 24))));

    if (!feature) {
      res.status(400).json({ error: 'Specify ai, number, or color prediction pass.' });
      return;
    }

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const colName =
      feature === 'ai'
        ? 'ai_pred_expires_at'
        : feature === 'number'
        ? 'number_pred_expires_at'
        : 'color_pred_expires_at';
    const label =
      feature === 'ai'
        ? 'AI PASS Membership'
        : feature === 'number'
        ? 'Number Prediction (0–9)'
        : 'Color Prediction';
    const ts = nowIso();
    let newExpiry: string | null = null;
    let activityTitle = '';
    let activityDetails = '';

    if (action === 'set_expiry') {
      const rawExpiry = String(req.body?.expiresAt || '').trim();
      const parsedMs = rawExpiry ? Date.parse(rawExpiry) : NaN;
      if (!rawExpiry || Number.isNaN(parsedMs)) {
        res.status(400).json({ error: 'Enter a valid custom expiry date and time.' });
        return;
      }
      const maxFutureMs = Date.now() + 10 * 365 * 24 * 3600 * 1000;
      if (parsedMs > maxFutureMs) {
        res.status(400).json({ error: 'Custom expiry date cannot exceed 10 years from today.' });
        return;
      }
      newExpiry = new Date(parsedMs).toISOString();
      activityTitle = `Admin Set Custom Expiry · ${label}`;
      activityDetails = `Membership validity updated to ${newExpiry}.`;
    } else if (action === 'grant') {
      const existingIso =
        feature === 'ai'
          ? target.ai_pred_expires_at
          : feature === 'number'
          ? target.number_pred_expires_at
          : target.color_pred_expires_at;
      const existingMs = existingIso ? Date.parse(existingIso) : 0;
      const baseMs = !Number.isNaN(existingMs) && existingMs > Date.now() ? existingMs : Date.now();
      newExpiry = new Date(baseMs + hours * 3600 * 1000).toISOString();
      activityTitle = `Admin Granted ${label} (${hours}h)`;
      activityDetails = `Access extended until ${newExpiry}.`;
    } else {
      newExpiry = null;
      activityTitle = `Admin Removed ${label}`;
      activityDetails = 'Membership deactivated and cleared by administrator.';
    }

    db.prepare(`UPDATE users SET ${colName} = ? WHERE id = ?`).run(newExpiry, userId);

    const statusLabel =
      action === 'revoke'
        ? 'Revoked'
        : newExpiry && Date.parse(newExpiry) > Date.now()
        ? 'Active'
        : 'Expired';

    logActivity({
      userId,
      category: 'notice',
      title: activityTitle,
      details: activityDetails,
      status: statusLabel,
      createdAt: ts,
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
    res.json({ user: serializeUser(updated) });
  });

  app.get('/api/admin/games', requireAdmin, (_req, res) => {
    const games = db
      .prepare('SELECT * FROM games ORDER BY is_default DESC, id ASC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      games: games.map((g) => ({
        ...g,
        game_mode: g.game_mode === 'embed' ? 'embed' : 'source',
        embed_url: String(g.embed_url || ''),
        mod_menu_config: String(g.mod_menu_config || ''),
        modMenuConfig: normalizeModMenuConfig(g.mod_menu_config, String(g.slug || '')),
      })),
    });
  });

  app.post('/api/admin/games/restore-default', requireAdmin, (_req, res) => {
    const restored = restoreDefaultKwgGame() as Record<string, unknown>;
    res.json({
      game: {
        ...restored,
        modMenuConfig: normalizeModMenuConfig(restored.mod_menu_config, 'kwg-game'),
      },
    });
  });

  app.post('/api/admin/games', requireAdmin, (req, res) => {
    const name = String(req.body?.name || '').trim();
    const titleInput = String(req.body?.title || '').trim();
    const descInput = String(req.body?.description || '').trim();
    const thumbnail = sanitizeThumbnail(req.body?.thumbnail);
    const pricingType = req.body?.pricingType === 'paid' ? 'paid' : 'free';
    const price = pricingType === 'paid' ? roundMoney(Number(req.body?.price)) : 0;
    const billingMode = req.body?.billingMode === 'per_play' ? 'per_play' : 'once';
    const gameMode = req.body?.gameMode === 'embed' ? 'embed' : 'source';
    const embedUrlRaw = String(req.body?.embedUrl || '').trim();
    const sanitizedEmbedUrl = gameMode === 'embed' ? sanitizeEmbedUrl(embedUrlRaw) : '';
    let htmlCode = String(req.body?.htmlCode || '');
    const cssCode = gameMode === 'embed' ? '' : String(req.body?.cssCode || '');
    const jsCode = gameMode === 'embed' ? '' : String(req.body?.jsCode || '');

    if (!name) {
      res.status(400).json({ error: 'Game name is required.' });
      return;
    }

    const title = titleInput || name;
    const description =
      descInput ||
      (gameMode === 'embed'
        ? `Play ${name} directly inside KWG Arena with live Mod Menu integration.`
        : `Play ${name} directly on KWG Arena.`);

    if (gameMode === 'embed') {
      if (!sanitizedEmbedUrl) {
        res.status(400).json({ error: 'Enter a valid http:// or https:// game URL to embed.' });
        return;
      }
      htmlCode = buildEmbedWrapperHtml(title, sanitizedEmbedUrl);
    } else if (!htmlCode.trim() && !cssCode.trim() && !jsCode.trim()) {
      res.status(400).json({ error: 'Provide HTML, CSS, or JavaScript source code for the game.' });
      return;
    }

    if (pricingType === 'paid' && (!Number.isFinite(price) || price <= 0)) {
      res.status(400).json({ error: 'Paid games must have a price greater than ₹0.' });
      return;
    }

    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'game';
    const slug = `${baseSlug}-${Date.now().toString().slice(-5)}`;
    const modMenuConfigObj = normalizeModMenuConfig(req.body?.modMenuConfig, slug);
    const modMenuConfigJson = JSON.stringify(modMenuConfigObj);
    const ts = nowIso();

    const result = db
      .prepare(
        `INSERT INTO games (slug, name, title, description, thumbnail, pricing_type, price, billing_mode, html_code, css_code, js_code, game_mode, embed_url, mod_menu_config, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        slug,
        name,
        title,
        description,
        thumbnail,
        pricingType,
        price,
        billingMode,
        htmlCode,
        cssCode,
        jsCode,
        gameMode,
        sanitizedEmbedUrl || '',
        modMenuConfigJson,
        ts,
        ts
      );

    const created = db.prepare('SELECT * FROM games WHERE id = ?').get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({
      game: {
        ...created,
        modMenuConfig: modMenuConfigObj,
      },
    });
  });

  app.put('/api/admin/games/:id', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as
      | { id: number; slug: string; is_default: number }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Game not found.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const titleInput = String(req.body?.title || '').trim();
    const descInput = String(req.body?.description || '').trim();
    const thumbnail = sanitizeThumbnail(req.body?.thumbnail);
    const pricingType = req.body?.pricingType === 'paid' ? 'paid' : 'free';
    const price = pricingType === 'paid' ? roundMoney(Number(req.body?.price)) : 0;
    const billingMode = req.body?.billingMode === 'per_play' ? 'per_play' : 'once';
    const gameMode = req.body?.gameMode === 'embed' ? 'embed' : 'source';
    const embedUrlRaw = String(req.body?.embedUrl || '').trim();
    const sanitizedEmbedUrl = gameMode === 'embed' ? sanitizeEmbedUrl(embedUrlRaw) : '';
    let htmlCode = String(req.body?.htmlCode || '');
    const cssCode = gameMode === 'embed' ? '' : String(req.body?.cssCode || '');
    const jsCode = gameMode === 'embed' ? '' : String(req.body?.jsCode || '');

    if (!name) {
      res.status(400).json({ error: 'Game name is required.' });
      return;
    }
    const title = titleInput || name;
    const description = descInput || `Play ${name} directly on KWG Arena.`;

    if (gameMode === 'embed') {
      if (!sanitizedEmbedUrl) {
        res.status(400).json({ error: 'Enter a valid http:// or https:// game URL to embed.' });
        return;
      }
      htmlCode = buildEmbedWrapperHtml(title, sanitizedEmbedUrl);
    } else if (!htmlCode.trim() && !cssCode.trim() && !jsCode.trim()) {
      res.status(400).json({ error: 'Provide HTML, CSS, or JavaScript source code for the game.' });
      return;
    }

    if (pricingType === 'paid' && (!Number.isFinite(price) || price <= 0)) {
      res.status(400).json({ error: 'Paid games must have a price greater than ₹0.' });
      return;
    }

    const modMenuConfigObj = normalizeModMenuConfig(req.body?.modMenuConfig, existing.slug);
    const modMenuConfigJson = JSON.stringify(modMenuConfigObj);
    const ts = nowIso();
    db.prepare(
      `UPDATE games
       SET name = ?, title = ?, description = ?, thumbnail = ?, pricing_type = ?, price = ?, billing_mode = ?, html_code = ?, css_code = ?, js_code = ?, game_mode = ?, embed_url = ?, mod_menu_config = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      title,
      description,
      thumbnail,
      pricingType,
      price,
      billingMode,
      htmlCode,
      cssCode,
      jsCode,
      gameMode,
      sanitizedEmbedUrl || '',
      modMenuConfigJson,
      ts,
      gameId
    );

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as Record<string, unknown>;
    res.json({
      game: {
        ...updated,
        modMenuConfig: modMenuConfigObj,
      },
    });
  });

  app.delete('/api/admin/games/:id', requireAdmin, (req, res) => {
    const gameId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as
      | { id: number; slug: string; is_default: number }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Game not found.' });
      return;
    }
    if (existing.is_default === 1) {
      res.status(400).json({ error: 'The default KWG Game cannot be deleted, though you can edit it.' });
      return;
    }

    db.prepare('DELETE FROM mod_menu_history WHERE game_slug = ?').run(existing.slug);
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    res.json({ ok: true });
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.originalUrl.startsWith('/api')) {
      const anyErr = err as { type?: string; status?: number; statusCode?: number; message?: string };
      if (anyErr?.type === 'entity.too.large' || anyErr?.status === 413 || anyErr?.statusCode === 413) {
        res.status(413).json({
          error: 'Payload is too large (max 32MB). Please upload smaller files or images.',
        });
        return;
      }
      if (
        anyErr?.type === 'entity.parse.failed' ||
        (err instanceof SyntaxError && (anyErr?.status === 400 || anyErr?.statusCode === 400))
      ) {
        res.status(400).json({ error: 'Invalid JSON request payload.' });
        return;
      }
      console.error('Unhandled API error:', err);
      const status =
        typeof anyErr?.status === 'number' && anyErr.status >= 400 && anyErr.status < 600
          ? anyErr.status
          : 500;
      res.status(status).json({ error: anyErr?.message || 'Internal server error.' });
      return;
    }
    next(err);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found.');
      }
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KWG Arena server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
