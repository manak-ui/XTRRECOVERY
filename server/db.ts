import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KWG_DEFAULT_HTML } from './kwgDefaultGame.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'platform.db');
export const db = new DatabaseSync(DB_PATH);

try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
} catch {
  // ignore if not currently in WAL mode
}
db.exec('PRAGMA journal_mode = DELETE;');
db.exec('PRAGMA synchronous = FULL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    game_pin_hash TEXT,
    wallet_balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    ban_reason TEXT,
    ban_notice TEXT,
    banned_at TEXT,
    ban_expires_at TEXT,
    number_pred_expires_at TEXT,
    color_pred_expires_at TEXT,
    ai_pred_expires_at TEXT,
    device_id TEXT NOT NULL DEFAULT '',
    device_fp TEXT NOT NULL DEFAULT '',
    device_ban_exempt INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    thumbnail TEXT NOT NULL,
    pricing_type TEXT NOT NULL DEFAULT 'free',
    price REAL NOT NULL DEFAULT 0,
    billing_mode TEXT NOT NULL DEFAULT 'once',
    html_code TEXT NOT NULL DEFAULT '',
    css_code TEXT NOT NULL DEFAULT '',
    js_code TEXT NOT NULL DEFAULT '',
    game_mode TEXT NOT NULL DEFAULT 'source',
    embed_url TEXT NOT NULL DEFAULT '',
    mod_menu_config TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_unlocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    amount_paid REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    utr TEXT NOT NULL DEFAULT '',
    upi_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    custom_status TEXT NOT NULL DEFAULT '',
    admin_notice TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    admin_notice TEXT NOT NULL DEFAULT '',
    amount REAL,
    status TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payment_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    upi_id TEXT NOT NULL DEFAULT 'merchant@upi',
    payee_name TEXT NOT NULL DEFAULT 'KWG Arena Payments',
    instructions TEXT NOT NULL DEFAULT 'Scan the dynamic UPI QR code using any UPI app, complete the payment, and enter your 12-digit UTR reference number below.',
    deposits_enabled INTEGER NOT NULL DEFAULT 1,
    min_deposit REAL NOT NULL DEFAULT 100,
    max_deposit REAL NOT NULL DEFAULT 50000,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    brand_name TEXT NOT NULL DEFAULT 'KWG Arena',
    tagline TEXT NOT NULL DEFAULT 'VIP Gaming Vault & Smart Wingo Predictor',
    announcement_text TEXT NOT NULL DEFAULT '',
    announcement_enabled INTEGER NOT NULL DEFAULT 0,
    support_url TEXT NOT NULL DEFAULT 'https://t.me/animetraderss',
    support_initialized INTEGER NOT NULL DEFAULT 1,
    registrations_enabled INTEGER NOT NULL DEFAULT 1,
    maintenance_mode INTEGER NOT NULL DEFAULT 0,
    maintenance_message TEXT NOT NULL DEFAULT 'Platform maintenance is underway. Back online shortly.',
    welcome_bonus REAL NOT NULL DEFAULT 0,
    number_pred_price REAL NOT NULL DEFAULT 20,
    number_pred_hours INTEGER NOT NULL DEFAULT 24,
    number_pred_enabled INTEGER NOT NULL DEFAULT 1,
    color_pred_price REAL NOT NULL DEFAULT 10,
    color_pred_hours INTEGER NOT NULL DEFAULT 48,
    color_pred_enabled INTEGER NOT NULL DEFAULT 1,
    min_unlock_hours INTEGER NOT NULL DEFAULT 1,
    max_unlock_hours INTEGER NOT NULL DEFAULT 720,
    ai_weekly_price REAL NOT NULL DEFAULT 101,
    ai_15days_price REAL NOT NULL DEFAULT 250,
    ai_monthly_price REAL NOT NULL DEFAULT 499,
    ai_yearly_price REAL NOT NULL DEFAULT 1199,
    ai_pred_enabled INTEGER NOT NULL DEFAULT 1,
    ai_pricing_v2_migrated INTEGER NOT NULL DEFAULT 1,
    predictor_mode TEXT NOT NULL DEFAULT 'pattern-ai',
    strategy_pattern_enabled INTEGER NOT NULL DEFAULT 1,
    strategy_momentum_enabled INTEGER NOT NULL DEFAULT 0,
    strategy_contrarian_enabled INTEGER NOT NULL DEFAULT 0,
    strategy_all_three_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wingo_live_draws (
    interval TEXT NOT NULL,
    issue_number TEXT NOT NULL,
    number INTEGER NOT NULL,
    actual_result TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'live-api',
    created_at TEXT NOT NULL,
    PRIMARY KEY (interval, issue_number)
  );

  CREATE TABLE IF NOT EXISTS mod_menu_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_slug TEXT NOT NULL,
    game_name TEXT NOT NULL,
    period_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    level INTEGER NOT NULL,
    max_levels INTEGER NOT NULL,
    bet_amount REAL NOT NULL,
    outcome TEXT NOT NULL,
    pnl_delta REAL NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'manual',
    actual_number INTEGER,
    actual_result TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const modHistoryColumns = db
  .prepare('PRAGMA table_info(mod_menu_history)')
  .all() as Array<{ name: string }>;
const existingModCols = new Set(modHistoryColumns.map((col) => col.name));
if (!existingModCols.has('entry_type')) {
  db.exec("ALTER TABLE mod_menu_history ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'manual';");
}
if (!existingModCols.has('actual_number')) {
  db.exec('ALTER TABLE mod_menu_history ADD COLUMN actual_number INTEGER;');
}
if (!existingModCols.has('actual_result')) {
  db.exec("ALTER TABLE mod_menu_history ADD COLUMN actual_result TEXT NOT NULL DEFAULT '';");
}
db.exec(
  'CREATE INDEX IF NOT EXISTS idx_mod_history_user_game_type ON mod_menu_history(user_id, game_slug, entry_type, period_id);'
);

db.exec(`
  CREATE TABLE IF NOT EXISTS prediction_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature TEXT NOT NULL,
    hours INTEGER NOT NULL,
    amount REAL NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_slug TEXT NOT NULL,
    game_name TEXT NOT NULL,
    interval TEXT NOT NULL DEFAULT '1m',
    period_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    digit INTEGER NOT NULL,
    color TEXT NOT NULL,
    has_violet INTEGER NOT NULL DEFAULT 0,
    confidence INTEGER NOT NULL,
    selected_strategy TEXT NOT NULL DEFAULT '',
    strategy_tag TEXT NOT NULL DEFAULT '',
    reason_summary TEXT NOT NULL DEFAULT '',
    actual_number INTEGER,
    actual_result TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, game_slug, interval, period_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_pred_hist_user_interval_period
    ON ai_prediction_history(user_id, interval, period_id);
`);

const userColumns = db
  .prepare('PRAGMA table_info(users)')
  .all() as Array<{ name: string }>;
const existingUserCols = new Set(userColumns.map((col) => col.name));
if (!existingUserCols.has('ban_expires_at')) {
  db.exec('ALTER TABLE users ADD COLUMN ban_expires_at TEXT;');
}
if (!existingUserCols.has('number_pred_expires_at')) {
  db.exec('ALTER TABLE users ADD COLUMN number_pred_expires_at TEXT;');
}
if (!existingUserCols.has('color_pred_expires_at')) {
  db.exec('ALTER TABLE users ADD COLUMN color_pred_expires_at TEXT;');
}
if (!existingUserCols.has('ai_pred_expires_at')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_pred_expires_at TEXT;');
}
if (!existingUserCols.has('device_id')) {
  db.exec("ALTER TABLE users ADD COLUMN device_id TEXT NOT NULL DEFAULT '';");
}
if (!existingUserCols.has('device_fp')) {
  db.exec("ALTER TABLE users ADD COLUMN device_fp TEXT NOT NULL DEFAULT '';");
}
if (!existingUserCols.has('device_ban_exempt')) {
  db.exec('ALTER TABLE users ADD COLUMN device_ban_exempt INTEGER NOT NULL DEFAULT 0;');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_device_fp ON users(device_fp);');

const depositColumns = db
  .prepare('PRAGMA table_info(deposits)')
  .all() as Array<{ name: string }>;
const existingDepositCols = new Set(depositColumns.map((col) => col.name));
if (!existingDepositCols.has('custom_status')) {
  db.exec("ALTER TABLE deposits ADD COLUMN custom_status TEXT NOT NULL DEFAULT '';");
}

const platformColumns = db
  .prepare('PRAGMA table_info(platform_settings)')
  .all() as Array<{ name: string }>;
const existingPlatformCols = new Set(platformColumns.map((col) => col.name));
if (!existingPlatformCols.has('ai_weekly_price')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_weekly_price REAL NOT NULL DEFAULT 101;');
}
if (!existingPlatformCols.has('ai_15days_price')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_15days_price REAL NOT NULL DEFAULT 250;');
}
if (!existingPlatformCols.has('ai_monthly_price')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_monthly_price REAL NOT NULL DEFAULT 499;');
}
if (!existingPlatformCols.has('ai_yearly_price')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_yearly_price REAL NOT NULL DEFAULT 1199;');
}
if (!existingPlatformCols.has('ai_pred_enabled')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_pred_enabled INTEGER NOT NULL DEFAULT 1;');
}
if (!existingPlatformCols.has('ai_pricing_v2_migrated')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN ai_pricing_v2_migrated INTEGER NOT NULL DEFAULT 0;');
  db.exec(
    'UPDATE platform_settings SET ai_weekly_price = 101, ai_15days_price = 250, ai_monthly_price = 499, ai_yearly_price = 1199, ai_pricing_v2_migrated = 1 WHERE id = 1;'
  );
}
if (!existingPlatformCols.has('support_initialized')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN support_initialized INTEGER NOT NULL DEFAULT 0;');
}
if (!existingPlatformCols.has('strategy_pattern_enabled')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN strategy_pattern_enabled INTEGER NOT NULL DEFAULT 1;');
}
if (!existingPlatformCols.has('strategy_momentum_enabled')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN strategy_momentum_enabled INTEGER NOT NULL DEFAULT 0;');
}
if (!existingPlatformCols.has('strategy_contrarian_enabled')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN strategy_contrarian_enabled INTEGER NOT NULL DEFAULT 0;');
}
if (!existingPlatformCols.has('strategy_all_three_enabled')) {
  db.exec('ALTER TABLE platform_settings ADD COLUMN strategy_all_three_enabled INTEGER NOT NULL DEFAULT 0;');
  // Sync initial active flag from existing predictor_mode
  const rowMode = db.prepare('SELECT predictor_mode FROM platform_settings WHERE id = 1').get() as
    | { predictor_mode?: string }
    | undefined;
  if (rowMode?.predictor_mode === 'trend-follow') {
    db.exec(
      'UPDATE platform_settings SET strategy_pattern_enabled = 0, strategy_momentum_enabled = 1, strategy_contrarian_enabled = 0 WHERE id = 1;'
    );
  } else if (rowMode?.predictor_mode === 'contrarian') {
    db.exec(
      'UPDATE platform_settings SET strategy_pattern_enabled = 0, strategy_momentum_enabled = 0, strategy_contrarian_enabled = 1 WHERE id = 1;'
    );
  }
}

const gameColumns = db
  .prepare('PRAGMA table_info(games)')
  .all() as Array<{ name: string }>;
const existingGameCols = new Set(gameColumns.map((col) => col.name));
if (!existingGameCols.has('game_mode')) {
  db.exec("ALTER TABLE games ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'source';");
}
if (!existingGameCols.has('embed_url')) {
  db.exec("ALTER TABLE games ADD COLUMN embed_url TEXT NOT NULL DEFAULT '';");
}
if (!existingGameCols.has('mod_menu_config')) {
  db.exec("ALTER TABLE games ADD COLUMN mod_menu_config TEXT NOT NULL DEFAULT '';");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function roundMoney(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

export function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHex] = storedHash.split(':');
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(secret, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function generateUid(): string {
  const row = db.prepare('SELECT MAX(id) AS maxId FROM users').get() as { maxId: number | null };
  const nextSeq = (row?.maxId || 0) + 100001;
  return String(nextSeq);
}

export function logActivity(params: {
  userId: number;
  category: 'deposit' | 'wallet' | 'game' | 'notice' | 'security' | 'ban';
  title: string;
  details?: string;
  adminNotice?: string;
  amount?: number | null;
  status?: string;
  createdAt?: string;
}): void {
  db.prepare(
    `INSERT INTO activity_logs (user_id, category, title, details, admin_notice, amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId,
    params.category,
    params.title,
    params.details || '',
    params.adminNotice || '',
    params.amount !== undefined && params.amount !== null ? roundMoney(params.amount) : null,
    params.status || '',
    params.createdAt || nowIso()
  );
}

const existingPayment = db.prepare('SELECT id FROM payment_settings WHERE id = 1').get();
if (!existingPayment) {
  db.prepare(
    `INSERT INTO payment_settings (id, upi_id, payee_name, instructions, deposits_enabled, min_deposit, max_deposit, updated_at)
     VALUES (1, ?, ?, ?, 1, 100, 50000, ?)`
  ).run(
    'kwgarena@upi',
    'KWG Arena Payments',
    'Scan the dynamic UPI QR code using any UPI app, complete your payment, and submit the 12-digit UTR number for admin verification.',
    nowIso()
  );
}

const existingPlatformSettings = db
  .prepare('SELECT id, support_url, support_initialized FROM platform_settings WHERE id = 1')
  .get() as { id: number; support_url?: string; support_initialized?: number } | undefined;
if (!existingPlatformSettings) {
  db.prepare(
    `INSERT INTO platform_settings (
      id, brand_name, tagline, announcement_text, announcement_enabled, support_url, support_initialized,
      registrations_enabled, maintenance_mode, maintenance_message, welcome_bonus,
      number_pred_price, number_pred_hours, number_pred_enabled,
      color_pred_price, color_pred_hours, color_pred_enabled,
      min_unlock_hours, max_unlock_hours, predictor_mode, updated_at
    ) VALUES (1, 'KWG Arena', 'VIP Gaming Vault & Smart Wingo Predictor', '', 0, 'https://t.me/animetraderss', 1, 1, 0, 'Platform maintenance is underway. Back online shortly.', 0, 20, 24, 1, 10, 48, 1, 1, 720, 'pattern-ai', ?)`
  ).run(nowIso());
} else if (!existingPlatformSettings.support_initialized) {
  const nextSupport = existingPlatformSettings.support_url?.trim() || 'https://t.me/animetraderss';
  db.prepare(
    'UPDATE platform_settings SET support_url = ?, support_initialized = 1 WHERE id = 1'
  ).run(nextSupport);
}

export function getPlatformSettingsRow() {
  return db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as {
    brand_name: string;
    tagline: string;
    announcement_text: string;
    announcement_enabled: number;
    support_url: string;
    registrations_enabled: number;
    maintenance_mode: number;
    maintenance_message: string;
    welcome_bonus: number;
    number_pred_price: number;
    number_pred_hours: number;
    number_pred_enabled: number;
    color_pred_price: number;
    color_pred_hours: number;
    color_pred_enabled: number;
    min_unlock_hours: number;
    max_unlock_hours: number;
    ai_weekly_price: number;
    ai_15days_price: number;
    ai_monthly_price: number;
    ai_yearly_price: number;
    ai_pred_enabled: number;
    predictor_mode: string;
    strategy_pattern_enabled: number;
    strategy_momentum_enabled: number;
    strategy_contrarian_enabled: number;
    strategy_all_three_enabled: number;
    updated_at: string;
  };
}

const buildEmbedHtml = (title: string, url: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${title}</title>
<style>html,body,#gameFrame{width:100%;height:100%;margin:0;padding:0;border:0;background:#050508;overflow:hidden;}</style>
</head>
<body>
<iframe id="gameFrame" src="${url}" allowfullscreen></iframe>
</body>
</html>`;

export const KWG_DEFAULT_META = {
  slug: 'kwg-game',
  name: 'KWG Game',
  title: 'KWG Game — VIP Mod Menu & AI Predictor',
  description:
    'Play KWG Game directly on the website with its floating VIP MOD button, Wingo 1M BIG/SMALL predictor, 1-5 level amount splitter, and WIN/LOSS tracking.',
  thumbnail: '/src/assets/images/kwg_game_thumb_1795541883618.jpg',
  embedUrl: 'https://kwgbet9.com/#/register?invitationCode=5440231Z27',
  modMenuConfig: JSON.stringify({
    enabled: true,
    menuType: 'wingo-full',
    themePreset: 'cyber-cyan',
    clockMode: 'ist-standard',
    showLevelSplit: true,
    showManualHistory: true,
    showColorNumberPred: true,
  }),
};

export function restoreDefaultKwgGame() {
  const existing = db
    .prepare("SELECT id, created_at FROM games WHERE slug = 'kwg-game' OR is_default = 1 LIMIT 1")
    .get() as { id: number; created_at: string } | undefined;
  const ts = nowIso();
  const embedHtml = buildEmbedHtml(KWG_DEFAULT_META.title, KWG_DEFAULT_META.embedUrl);
  if (!existing) {
    db.prepare(
      `INSERT INTO games (slug, name, title, description, thumbnail, pricing_type, price, billing_mode, html_code, css_code, js_code, game_mode, embed_url, mod_menu_config, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'free', 0, 'once', ?, '', '', 'embed', ?, ?, 1, ?, ?)`
    ).run(
      KWG_DEFAULT_META.slug,
      KWG_DEFAULT_META.name,
      KWG_DEFAULT_META.title,
      KWG_DEFAULT_META.description,
      KWG_DEFAULT_META.thumbnail,
      embedHtml,
      KWG_DEFAULT_META.embedUrl,
      KWG_DEFAULT_META.modMenuConfig,
      ts,
      ts
    );
    return db.prepare("SELECT * FROM games WHERE slug = 'kwg-game'").get();
  }

  db.prepare(
    `UPDATE games
     SET name = ?, title = ?, description = ?, thumbnail = ?, pricing_type = 'free', price = 0, billing_mode = 'once',
         html_code = ?, css_code = '', js_code = '', game_mode = 'embed', embed_url = ?, mod_menu_config = ?, updated_at = created_at
     WHERE id = ?`
  ).run(
    KWG_DEFAULT_META.name,
    KWG_DEFAULT_META.title,
    KWG_DEFAULT_META.description,
    KWG_DEFAULT_META.thumbnail,
    embedHtml,
    KWG_DEFAULT_META.embedUrl,
    KWG_DEFAULT_META.modMenuConfig,
    existing.id
  );
  return db.prepare('SELECT * FROM games WHERE id = ?').get(existing.id);
}

const existingKwg = db
  .prepare(
    "SELECT id, created_at, updated_at, game_mode, embed_url, mod_menu_config FROM games WHERE slug = 'kwg-game' OR is_default = 1"
  )
  .get() as
  | {
      id: number;
      created_at: string;
      updated_at: string;
      game_mode?: string;
      embed_url?: string;
      mod_menu_config?: string;
    }
  | undefined;

if (!existingKwg) {
  restoreDefaultKwgGame();
} else if (
  (existingKwg.game_mode === 'source' && !existingKwg.embed_url) ||
  existingKwg.embed_url === 'https://www.kwgin4.com/#/register?invitationCode=5440231Z27'
) {
  db.prepare(
    `UPDATE games
     SET game_mode = 'embed', embed_url = ?, html_code = ?, css_code = '', js_code = '', mod_menu_config = ?
     WHERE id = ?`
  ).run(
    KWG_DEFAULT_META.embedUrl,
    buildEmbedHtml(KWG_DEFAULT_META.title, KWG_DEFAULT_META.embedUrl),
    existingKwg.mod_menu_config || KWG_DEFAULT_META.modMenuConfig,
    existingKwg.id
  );
} else if (existingKwg.created_at === existingKwg.updated_at) {
  db.prepare('UPDATE games SET html_code = ?, description = ?, mod_menu_config = ? WHERE id = ?').run(
    buildEmbedHtml(KWG_DEFAULT_META.title, existingKwg.embed_url || KWG_DEFAULT_META.embedUrl),
    KWG_DEFAULT_META.description,
    existingKwg.mod_menu_config || KWG_DEFAULT_META.modMenuConfig,
    existingKwg.id
  );
} else if (!existingKwg.mod_menu_config) {
  db.prepare('UPDATE games SET mod_menu_config = ? WHERE id = ?').run(
    KWG_DEFAULT_META.modMenuConfig,
    existingKwg.id
  );
}

const PARTNER_WINGO_GAMES = [
  {
    slug: 'yaarwin',
    name: 'Yaarwin',
    title: 'Yaarwin — Wingo 1M Green Mod Menu',
    description:
      'Play Yaarwin directly with Wingo 1M period-matched predictions, green neon VIP scanner, 1–5 level amount splitting, and settled WIN/LOSS history.',
    thumbnail: '/src/assets/images/yaarwin_game_thumb_1795543874891.jpg',
    url: 'https://9yaarwin.com/#/register?invitationCode=14342839592',
    themePreset: 'neon-green',
  },
  {
    slug: 'tg-dream',
    name: 'TG Dream',
    title: 'TG Dream — Wingo 1M High-Blue Mod Menu',
    description:
      'Play TG Dream directly with Wingo 1M period-matched predictions, ultra high-blue VIP scanner, 1–5 level amount splitting, and settled WIN/LOSS history.',
    thumbnail: '/src/assets/images/tgdream_game_thumb_1795543876158.jpg',
    url: 'https://tgdream.pro/#/register?invitationCode=688182170541',
    themePreset: 'high-blue',
  },
  {
    slug: 'jai-club',
    name: 'Jai Club',
    title: 'Jai Club — Wingo 1M Spectrum Mod Menu',
    description:
      'Play Jai Club directly with Wingo 1M period-matched predictions, purple-blue-green-pink spectrum VIP scanner, 1–5 level splitting, and WIN/LOSS history.',
    thumbnail: '/src/assets/images/jaiclub_game_thumb_1795543875717.jpg',
    url: 'https://www.jaiclub37.com/#/register?invitationCode=768697903172',
    themePreset: 'spectrum',
  },
  {
    slug: 'dm-play',
    name: 'DM Play',
    title: 'DM Play — Wingo 1M Red Mod Menu',
    description:
      'Play DM Play directly with Wingo 1M period-matched predictions, crimson red VIP scanner, 1–5 level amount splitting, and settled WIN/LOSS history.',
    thumbnail: '/src/assets/images/dmplay_game_thumb_1795543876360.jpg',
    url: 'https://www.dmplay20.com/#/register?invitationCode=28529901096',
    themePreset: 'crimson-red',
  },
  {
    slug: 'khelv-888',
    name: 'Khelv 888',
    title: 'Khelv 888 — Wingo 1M Red-Blue Mod Menu',
    description:
      'Play Khelv 888 directly with Wingo 1M period-matched predictions, red & blue dual-tone VIP scanner, 1–5 level splitting, and WIN/LOSS history.',
    thumbnail: '/src/assets/images/khelv_game_thumb_1795543879088.jpg',
    url: 'https://www.khelv888.com/#/register?invitationCode=14924615668',
    themePreset: 'red-blue',
  },
  {
    slug: '9k-club',
    name: '9K Club',
    title: '9K Club — Wingo 1M & 30S Royal Gold Mod Menu',
    description:
      'Play 9K Club directly with Wingo 1M & 30S period-matched predictions, Royal VIP Gold scanner, 1–5 level amount splitting, and settled WIN/LOSS history.',
    thumbnail: '/src/assets/images/9kclub_game_thumb_1795773250892.jpg',
    url: 'https://9kclub3.com/register?inviteCode=NADAXFN&from=web',
    themePreset: 'royal-gold',
  },
];

for (const g of PARTNER_WINGO_GAMES) {
  const defaultModCfg = JSON.stringify({
    enabled: true,
    menuType: 'wingo-full',
    themePreset: g.themePreset,
    clockMode: 'utc-partner-api',
    showLevelSplit: true,
    showManualHistory: true,
    showColorNumberPred: true,
  });
  const existing = db
    .prepare('SELECT id, mod_menu_config FROM games WHERE slug = ?')
    .get(g.slug) as { id: number; mod_menu_config?: string } | undefined;
  if (!existing) {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO games (slug, name, title, description, thumbnail, pricing_type, price, billing_mode, html_code, css_code, js_code, game_mode, embed_url, mod_menu_config, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'free', 0, 'once', ?, '', '', 'embed', ?, ?, 0, ?, ?)`
    ).run(g.slug, g.name, g.title, g.description, g.thumbnail, buildEmbedHtml(g.title, g.url), g.url, defaultModCfg, ts, ts);
  } else if (!existing.mod_menu_config) {
    db.prepare("UPDATE games SET game_mode = 'embed', embed_url = ?, mod_menu_config = ? WHERE id = ?").run(
      g.url,
      defaultModCfg,
      existing.id
    );
  }
}

