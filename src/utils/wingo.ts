import { apiRequest, getAuthToken } from '../api';
import type {
  AiPredictionHistoryItem,
  ModMenuConfig,
  ModMenuStyle,
  PredictorMode,
  StrategyConfigState,
  WingoClockMode,
  WingoInterval,
} from '../types';
import {
  evaluateHistoricalStrategyPerformance,
  filterAndSortPriorDraws,
  getPreviousPeriodId,
  getWingoClock,
  getWingoColorFromNumber,
  isUserAiPassUnlocked,
  normalizeStrategyConfig,
  PARTNER_WINGO_SLUGS,
  runCombinedWingoEngine,
  type CombinedEngineAnalysis,
  type ConfidenceLevel,
  type ConsensusType,
  type IndividualStrategyAnalysis,
  type PartnerWingoResultItem,
  type StrategyMetricItem,
  type StrategySignalValue,
  type WingoClock,
} from './wingoStrategies';

export {
  evaluateHistoricalStrategyPerformance,
  filterAndSortPriorDraws,
  getPreviousPeriodId,
  getWingoClock,
  getWingoColorFromNumber,
  isUserAiPassUnlocked,
  normalizeStrategyConfig,
  PARTNER_WINGO_SLUGS,
  runCombinedWingoEngine,
};
export type {
  AiPredictionHistoryItem,
  CombinedEngineAnalysis,
  ConfidenceLevel,
  ConsensusType,
  IndividualStrategyAnalysis,
  PartnerWingoResultItem,
  StrategyMetricItem,
  StrategySignalValue,
  WingoClock,
};

export const WINGO_API_URL = 'https://api.bdg88zf.com/api/webapi/GetGameIssue';
export const WINGO_RESULTS_API_URL = 'https://api.bdg88zf.com/api/webapi/GetNoaverageEmerdList';
export const WINGO_API_RANDOM = '40079dcba93a48769c6ee9d4d4fae23f';

// Compact RFC 1321 MD5 for dynamic upstream BDG Wingo API signatures (30s & 1m)
function md5Hex(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let i = 0; i < 8; i += 1) {
    bytes.push((i < 4 ? bitLen >>> (i * 8) : 0) & 0xff);
  }

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  for (let i = 0; i < bytes.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j += 1) {
      M[j] =
        bytes[i + j * 4] |
        (bytes[i + j * 4 + 1] << 8) |
        (bytes[i + j * 4 + 2] << 16) |
        (bytes[i + j * 4 + 3] << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let j = 0; j < 64; j += 1) {
      let F = 0;
      let g = 0;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      const temp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[j] + M[g]) >>> 0, s[j])) >>> 0;
      A = temp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const toHex = (n: number) => {
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return out;
  };
  return (toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)).toUpperCase();
}

export function getWingoTypeId(interval: WingoInterval = '1m'): number {
  return interval === '30s' ? 30 : 1;
}

export interface MenuThemeSpec {
  id: ModMenuStyle;
  name: string;
  label: string;
  menuBg: string;
  cardBg: string;
  accent: string;
  secondaryAccent: string;
  accentSoft: string;
  borderColor: string;
  frameGradient?: string;
  gridColor: string;
  beamGradient: string;
  ctaGradient: string;
  ctaTextDark: boolean;
  tabGradient: string;
  tabTextClass: string;
  glowShadow: string;
}

export const MOD_MENU_PRESETS: Record<Exclude<ModMenuStyle, 'custom'>, MenuThemeSpec> = {
  'cyber-cyan': {
    id: 'cyber-cyan',
    name: 'Cyber Cyan (KWG Classic)',
    label: 'WINGO AI SCANNER',
    menuBg: '#06070d',
    cardBg: '#0b0d18',
    accent: '#00f2ff',
    secondaryAccent: '#9d4edd',
    accentSoft: 'rgba(0, 242, 255, 0.16)',
    borderColor: 'rgba(0, 242, 255, 0.34)',
    gridColor: 'rgba(0, 242, 255, 0.05)',
    beamGradient: 'linear-gradient(180deg, rgba(0, 242, 255, 0.18), transparent 80%)',
    ctaGradient: 'linear-gradient(90deg, #00f2ff, #9d4edd)',
    ctaTextDark: false,
    tabGradient: 'linear-gradient(90deg, #06b6d4, #0ea5e9)',
    tabTextClass: 'text-slate-950',
    glowShadow: '0 0 34px rgba(0, 242, 255, 0.16)',
  },
  'neon-green': {
    id: 'neon-green',
    name: 'Neon Green (Yaarwin)',
    label: 'WINGO · GREEN EDITION',
    menuBg: '#031008',
    cardBg: '#061a0e',
    accent: '#00ff88',
    secondaryAccent: '#10b981',
    accentSoft: 'rgba(0, 255, 136, 0.16)',
    borderColor: 'rgba(0, 255, 136, 0.48)',
    gridColor: 'rgba(0, 255, 136, 0.08)',
    beamGradient: 'linear-gradient(180deg, rgba(0, 255, 136, 0.28), transparent 80%)',
    ctaGradient: 'linear-gradient(90deg, #00ff88, #059669)',
    ctaTextDark: true,
    tabGradient: 'linear-gradient(90deg, #00ff88, #10b981)',
    tabTextClass: 'text-slate-950',
    glowShadow: '0 0 38px rgba(0, 255, 136, 0.2)',
  },
  'high-blue': {
    id: 'high-blue',
    name: 'High Blue (TG Dream)',
    label: 'WINGO · HIGH BLUE EDITION',
    menuBg: '#02071c',
    cardBg: '#051038',
    accent: '#2998ff',
    secondaryAccent: '#0066ff',
    accentSoft: 'rgba(0, 115, 255, 0.24)',
    borderColor: 'rgba(0, 145, 255, 0.85)',
    gridColor: 'rgba(30, 144, 255, 0.14)',
    beamGradient: 'linear-gradient(180deg, rgba(0, 132, 255, 0.45), transparent 80%)',
    ctaGradient: 'linear-gradient(90deg, #004cff, #00aaff)',
    ctaTextDark: false,
    tabGradient: 'linear-gradient(90deg, #0055ff, #009dff)',
    tabTextClass: 'text-white',
    glowShadow: '0 0 44px rgba(0, 110, 255, 0.38)',
  },
  spectrum: {
    id: 'spectrum',
    name: 'Spectrum Multi (Jai Club)',
    label: 'WINGO · SPECTRUM EDITION',
    menuBg: '#090616',
    cardBg: '#110b26',
    accent: '#e879f9',
    secondaryAccent: '#34d399',
    accentSoft: 'rgba(168, 85, 247, 0.2)',
    borderColor: 'rgba(168, 85, 247, 0.55)',
    frameGradient: 'linear-gradient(135deg, #a855f7, #3b82f6, #10b981, #ec4899)',
    gridColor: 'rgba(168, 85, 247, 0.08)',
    beamGradient:
      'linear-gradient(180deg, rgba(236, 72, 153, 0.26), rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.14), transparent 85%)',
    ctaGradient: 'linear-gradient(90deg, #9333ea, #2563eb, #10b981, #ec4899)',
    ctaTextDark: false,
    tabGradient: 'linear-gradient(90deg, #9333ea, #3b82f6, #10b981, #ec4899)',
    tabTextClass: 'text-white',
    glowShadow: '0 0 40px rgba(168, 85, 247, 0.26)',
  },
  'crimson-red': {
    id: 'crimson-red',
    name: 'Crimson Red (DM Play)',
    label: 'WINGO · RED EDITION',
    menuBg: '#120408',
    cardBg: '#1e070e',
    accent: '#ff3352',
    secondaryAccent: '#dc2626',
    accentSoft: 'rgba(255, 46, 76, 0.2)',
    borderColor: 'rgba(255, 46, 76, 0.65)',
    gridColor: 'rgba(255, 46, 76, 0.1)',
    beamGradient: 'linear-gradient(180deg, rgba(255, 46, 76, 0.34), transparent 80%)',
    ctaGradient: 'linear-gradient(90deg, #ff2e4c, #b91c1c)',
    ctaTextDark: false,
    tabGradient: 'linear-gradient(90deg, #ff2e4c, #dc2626)',
    tabTextClass: 'text-white',
    glowShadow: '0 0 40px rgba(255, 46, 76, 0.28)',
  },
  'red-blue': {
    id: 'red-blue',
    name: 'Red & Blue Dual (Khelv)',
    label: 'WINGO · RED-BLUE EDITION',
    menuBg: '#0b0614',
    cardBg: '#130b22',
    accent: '#ff4264',
    secondaryAccent: '#2589ff',
    accentSoft: 'rgba(37, 137, 255, 0.18)',
    borderColor: 'rgba(255, 46, 76, 0.55)',
    frameGradient: 'linear-gradient(135deg, #ff2e4c, #1e78ff)',
    gridColor: 'rgba(37, 137, 255, 0.09)',
    beamGradient:
      'linear-gradient(180deg, rgba(255, 46, 76, 0.3), rgba(30, 120, 255, 0.26), transparent 85%)',
    ctaGradient: 'linear-gradient(90deg, #ff2e4c, #1e78ff)',
    ctaTextDark: false,
    tabGradient: 'linear-gradient(90deg, #ff2e4c, #1e78ff)',
    tabTextClass: 'text-white',
    glowShadow: '0 0 40px rgba(30, 120, 255, 0.26)',
  },
  'royal-gold': {
    id: 'royal-gold',
    name: 'Royal VIP Gold',
    label: 'WINGO · ROYAL GOLD VIP',
    menuBg: '#120d03',
    cardBg: '#1d1505',
    accent: '#ffd700',
    secondaryAccent: '#f97316',
    accentSoft: 'rgba(255, 215, 0, 0.18)',
    borderColor: 'rgba(255, 215, 0, 0.55)',
    frameGradient: 'linear-gradient(135deg, #ffd700, #f59e0b, #ea580c)',
    gridColor: 'rgba(255, 215, 0, 0.07)',
    beamGradient: 'linear-gradient(180deg, rgba(255, 215, 0, 0.24), transparent 80%)',
    ctaGradient: 'linear-gradient(90deg, #ffd700, #f59e0b)',
    ctaTextDark: true,
    tabGradient: 'linear-gradient(90deg, #facc15, #f59e0b)',
    tabTextClass: 'text-slate-950',
    glowShadow: '0 0 38px rgba(245, 158, 11, 0.25)',
  },
};

export function resolveMenuTheme(
  config: ModMenuConfig | undefined,
  gameName: string,
  gameSlug: string
): MenuThemeSpec {
  const defaultPresetBySlug = (): Exclude<ModMenuStyle, 'custom'> => {
    switch (gameSlug) {
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
  };

  const presetKey = config?.themePreset || defaultPresetBySlug();
  if (presetKey === 'custom') {
    const accent = /^#[0-9a-fA-F]{6}$/.test(config?.customAccent || '')
      ? config!.customAccent!
      : '#00f2ff';
    const secondary = /^#[0-9a-fA-F]{6}$/.test(config?.customSecondaryAccent || '')
      ? config!.customSecondaryAccent!
      : '#9d4edd';
    return {
      id: 'custom',
      name: 'Custom Theme',
      label: config?.customBadge?.trim() || `${gameName.toUpperCase()} · CUSTOM VIP MOD`,
      menuBg: '#07080f',
      cardBg: '#0e111d',
      accent,
      secondaryAccent: secondary,
      accentSoft: `${accent}29`,
      borderColor: `${accent}88`,
      frameGradient: `linear-gradient(135deg, ${accent}, ${secondary})`,
      gridColor: `${accent}14`,
      beamGradient: `linear-gradient(180deg, ${accent}38, transparent 82%)`,
      ctaGradient: `linear-gradient(90deg, ${accent}, ${secondary})`,
      ctaTextDark: false,
      tabGradient: `linear-gradient(90deg, ${accent}, ${secondary})`,
      tabTextClass: 'text-white',
      glowShadow: `0 0 38px ${accent}40`,
    };
  }

  const base = MOD_MENU_PRESETS[presetKey] || MOD_MENU_PRESETS['cyber-cyan'];
  const badgePrefix = gameName ? `${gameName.toUpperCase()} ` : '';
  return {
    ...base,
    label: config?.customBadge?.trim() || `${badgePrefix}${base.label}`.trim(),
  };
}

export function getWingo1MinClock(
  gameSlug: string,
  offsetMinutes = 0,
  clockMode?: WingoClockMode
): WingoClock {
  return getWingoClock(gameSlug, '1m', offsetMinutes, clockMode);
}

export type PredictionFeature = 'number' | 'color' | 'ai';

export interface AiSubscriptionPlan {
  id: 'weekly' | '15days' | 'monthly' | 'yearly';
  label: string;
  durationLabel: string;
  hours: number;
  price: number;
  badge?: string;
  savingsNote?: string;
}

export function getAiSubscriptionPlans(pricing?: {
  aiWeeklyPrice?: number;
  ai15DaysPrice?: number;
  aiMonthlyPrice?: number;
  aiYearlyPrice?: number;
}): AiSubscriptionPlan[] {
  return [
    {
      id: 'weekly',
      label: 'Weekly AI Pass',
      durationLabel: '7 Days',
      hours: 168,
      price: Math.max(0, Number(pricing?.aiWeeklyPrice ?? 101)),
      badge: 'STARTER',
      savingsNote: '₹14.4/day · 3-Strategy Gemini AI',
    },
    {
      id: '15days',
      label: '15-Day AI Pass',
      durationLabel: '15 Days',
      hours: 360,
      price: Math.max(0, Number(pricing?.ai15DaysPrice ?? 250)),
      badge: 'POPULAR',
      savingsNote: '₹16.6/day · Extended Run',
    },
    {
      id: 'monthly',
      label: 'Monthly AI Pass',
      durationLabel: '30 Days',
      hours: 720,
      price: Math.max(0, Number(pricing?.aiMonthlyPrice ?? 499)),
      badge: 'BEST VALUE',
      savingsNote: '₹16.6/day · Full 30-Day AI',
    },
    {
      id: 'yearly',
      label: 'Yearly VIP AI Pass',
      durationLabel: '365 Days',
      hours: 8760,
      price: Math.max(0, Number(pricing?.aiYearlyPrice ?? 1199)),
      badge: 'VIP MAX',
      savingsNote: 'Only ₹3.3/day · Save 78%',
    },
  ];
}

export interface WingoPredictionResult {
  label: 'BIG' | 'SMALL' | 'SKIP' | 'INSUFFICIENT_DATA';
  number: number;
  color: 'GREEN' | 'RED';
  hasViolet: boolean;
  prob: number;
  sureshot: boolean;
  allWalletSureshot: boolean;
  sureshotNote?: string;
  source?: 'gemini-ai' | 'local-pattern';
  selectedStrategy?: string;
  interval?: WingoInterval;
  dataProblem?: boolean;
  strategyTag: string;
  reasonSummary: string;
  analyzedCount: number;
  combinedAnalysis?: CombinedEngineAnalysis;
  lastResultsPreview: Array<{
    issueShort: string;
    number: number;
    actualResult: 'BIG' | 'SMALL';
    color: 'GREEN' | 'RED';
  }>;
}

export function analyzeWingoPattern(
  recentResults: PartnerWingoResultItem[],
  periodId: string,
  _gameSlug: string,
  _clockMode?: WingoClockMode,
  predictorMode: PredictorMode = 'pattern-ai',
  interval: WingoInterval = '1m',
  strategyConfig?: StrategyConfigState | null
): WingoPredictionResult {
  const combined = runCombinedWingoEngine(recentResults, periodId, {
    interval,
    strategyConfig,
    fallbackPredictorMode: predictorMode,
  });

  if (combined.insufficientData || combined.finalSignal === 'INSUFFICIENT DATA') {
    return {
      label: 'INSUFFICIENT_DATA',
      number: combined.suggestedDigit,
      color: combined.suggestedColor,
      hasViolet: combined.hasViolet,
      prob: 0,
      sureshot: false,
      allWalletSureshot: false,
      source: 'local-pattern',
      selectedStrategy: combined.selectedApproach,
      interval,
      dataProblem: true,
      strategyTag: `${combined.agreementLabel} · INSUFFICIENT DATA`,
      reasonSummary:
        combined.dataProblemMessage ||
        combined.summaryReason ||
        'Insufficient historical draw data (minimum 6 real draws required).',
      analyzedCount: combined.sampleCount,
      combinedAnalysis: combined,
      lastResultsPreview: combined.recentPreview,
    };
  }

  const label: 'BIG' | 'SMALL' = combined.finalSignal;
  const activeConfidences = [
    combined.strategies.patternBrain,
    combined.strategies.momentumTrend,
    combined.strategies.dragonContrarian,
  ]
    .filter((s) => (combined.activeCount > 0 ? s.active : true) && s.signal === label)
    .map((s) => s.confidence);
  const avgConfidence =
    activeConfidences.length > 0
      ? Math.round(activeConfidences.reduce((a, b) => a + b, 0) / activeConfidences.length)
      : Math.min(72, Math.max(54, Math.round(54 + Math.abs(combined.combinedScore) * 5)));
  const consensusBonus =
    combined.consensusType === 'THREE-WAY AGREEMENT'
      ? 6
      : combined.consensusType === 'MAJORITY SIGNAL'
      ? 2
      : 0;
  const prob = Math.min(95, Math.max(52, avgConfidence + consensusBonus));
  const allWalletSureshot =
    combined.consensusType === 'THREE-WAY AGREEMENT' && prob >= 88 && combined.sampleCount >= 10;

  return {
    label,
    number: combined.suggestedDigit,
    color: combined.suggestedColor,
    hasViolet: combined.hasViolet,
    prob,
    sureshot: combined.confidenceLevel === 'High',
    allWalletSureshot,
    sureshotNote: allWalletSureshot
      ? `3/3 THREE-WAY AGREEMENT · ${label} (${prob}%)`
      : undefined,
    source: 'local-pattern',
    selectedStrategy: combined.selectedApproach,
    interval,
    dataProblem: false,
    strategyTag:
      combined.activeCount >= 2 || combined.consensusType === 'AUTONOMOUS WEIGHTED'
        ? `${combined.agreementLabel} ${combined.consensusType}`
        : combined.agreeingStrategies[0] || predictorMode,
    reasonSummary: combined.summaryReason,
    analyzedCount: combined.sampleCount,
    combinedAnalysis: combined,
    lastResultsPreview: combined.recentPreview,
  };
}

export function getPredictionForPeriod(
  periodId: string,
  gameSlug: string,
  clockMode?: WingoClockMode,
  recentResults?: PartnerWingoResultItem[],
  predictorMode: PredictorMode = 'pattern-ai',
  interval: WingoInterval = '1m',
  strategyConfig?: StrategyConfigState | null
): WingoPredictionResult {
  return analyzeWingoPattern(
    recentResults || [],
    periodId,
    gameSlug,
    clockMode,
    predictorMode,
    interval,
    strategyConfig
  );
}

export async function requestAiWingoPrediction(params: {
  periodId: string;
  gameSlug: string;
  gameName: string;
  interval?: WingoInterval;
  clockMode?: WingoClockMode;
  clientResults?: PartnerWingoResultItem[];
}): Promise<{
  prediction: WingoPredictionResult;
  recentResults: PartnerWingoResultItem[];
  apiSource: string;
}> {
  return apiRequest<{
    prediction: WingoPredictionResult;
    recentResults: PartnerWingoResultItem[];
    apiSource: string;
  }>('/api/wingo/ai-predict', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchAiPredictionHistory(params?: {
  interval?: WingoInterval;
  gameSlug?: string;
  limit?: number;
}): Promise<{
  history: AiPredictionHistoryItem[];
  stats: {
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number | null;
  };
}> {
  const qs = new URLSearchParams();
  if (params?.interval) qs.set('interval', params.interval);
  if (params?.gameSlug) qs.set('gameSlug', params.gameSlug);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiRequest<{
    history: AiPredictionHistoryItem[];
    stats: {
      total: number;
      wins: number;
      losses: number;
      pending: number;
      winRate: number | null;
    };
  }>(`/api/wingo/prediction-history${query ? `?${query}` : ''}`);
}

export function calculatePredictionPrice(
  feature: PredictionFeature,
  hours: number,
  pricing?: {
    numberPredPrice?: number;
    numberPredHours?: number;
    colorPredPrice?: number;
    colorPredHours?: number;
    minUnlockHours?: number;
    maxUnlockHours?: number;
  }
): number {
  const minH = Math.max(1, Math.round(pricing?.minUnlockHours ?? 1));
  const maxH = Math.max(minH, Math.round(pricing?.maxUnlockHours ?? 720));
  const defaultHours =
    feature === 'number'
      ? Math.max(1, Math.round(pricing?.numberPredHours ?? 24))
      : Math.max(1, Math.round(pricing?.colorPredHours ?? 48));
  const basePrice =
    feature === 'number'
      ? Math.max(0, Number(pricing?.numberPredPrice ?? 20))
      : Math.max(0, Number(pricing?.colorPredPrice ?? 10));

  const clampedHours = Math.max(minH, Math.min(maxH, Math.round(hours || defaultHours)));
  if (basePrice <= 0) return 0;
  const raw = (clampedHours / defaultHours) * basePrice;
  return Math.max(1, Math.round((raw + Number.EPSILON) * 100) / 100);
}

export function isFeatureUnlocked(expiresAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return !Number.isNaN(ms) && ms > nowMs;
}

export function formatRemainingDuration(expiresAt: string | null | undefined, nowMs = Date.now()): string {
  if (!expiresAt) return 'Locked';
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms) || ms <= nowMs) return 'Expired';
  const diffMin = Math.max(1, Math.ceil((ms - nowMs) / 60000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH > 0 ? `${days}d ${remH}h left` : `${days}d left`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m left`;
  }
  return `${mins}m left`;
}

export async function fetchPartnerWingoIssue(interval: WingoInterval = '1m'): Promise<{
  issueNumber: string;
  secLeft: number;
} | null> {
  const typeId = getWingoTypeId(interval);
  const maxSec = interval === '30s' ? 30 : 60;
  const issueSorted = {
    language: 0,
    random: WINGO_API_RANDOM,
    typeId,
  };
  const signature = md5Hex(JSON.stringify(issueSorted));

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);
    const res = await fetch(WINGO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        typeId,
        language: 0,
        random: WINGO_API_RANDOM,
        signature,
        timestamp: Math.floor(Date.now() / 1000),
      }),
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          issueNumber?: string;
          endTime?: string;
          serviceTime?: string;
        };
      };
      if (json?.data?.issueNumber) {
        let secLeft = getWingoClock('yaarwin', interval).secLeft;
        if (json.data.endTime && json.data.serviceTime) {
          const endMs = Date.parse(json.data.endTime.replace(' ', 'T') + 'Z');
          const srvMs = Date.parse(json.data.serviceTime.replace(' ', 'T') + 'Z');
          if (!Number.isNaN(endMs) && !Number.isNaN(srvMs)) {
            secLeft = Math.max(1, Math.min(maxSec, Math.round((endMs - srvMs) / 1000)));
          }
        }
        return {
          issueNumber: String(json.data.issueNumber),
          secLeft,
        };
      }
    }
  } catch {
    // fallback to server proxy
  }

  try {
    const proxyRes = await apiRequest<{ issueNumber: string; secLeft: number }>(
      '/api/wingo/issue',
      {
        method: 'POST',
        body: JSON.stringify({ interval }),
      }
    );
    if (proxyRes?.issueNumber) {
      return {
        issueNumber: String(proxyRes.issueNumber),
        secLeft: Math.max(1, Math.min(maxSec, Number(proxyRes.secLeft) || maxSec)),
      };
    }
  } catch {
    // fallback to clock formula
  }

  return null;
}

export async function fetchPartnerWingoResults(
  pageSize = 30,
  interval: WingoInterval = '1m'
): Promise<PartnerWingoResultItem[]> {
  const typeId = getWingoTypeId(interval);
  const sorted = {
    language: 0,
    pageNo: 1,
    pageSize,
    random: WINGO_API_RANDOM,
    typeId,
  };
  const signature = md5Hex(JSON.stringify(sorted));

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3200);
    const res = await fetch(WINGO_RESULTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pageSize,
        pageNo: 1,
        typeId,
        language: 0,
        random: WINGO_API_RANDOM,
        signature,
        timestamp: Math.floor(Date.now() / 1000),
      }),
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    if (res.ok) {
      const json = (await res.json()) as {
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
        .filter((x): x is PartnerWingoResultItem => x !== null);
      if (parsed.length > 0) {
        if (getAuthToken()) {
          void apiRequest('/api/wingo/sync-draws', {
            method: 'POST',
            body: JSON.stringify({ interval, list: parsed }),
          }).catch(() => undefined);
        }
        return parsed;
      }
    }
  } catch {
    // fallback to server proxy
  }

  try {
    const proxyRes = await apiRequest<{ list?: PartnerWingoResultItem[] }>('/api/wingo/results', {
      method: 'POST',
      body: JSON.stringify({ interval, pageSize }),
    });
    if (Array.isArray(proxyRes?.list) && proxyRes.list.length > 0) {
      return proxyRes.list;
    }
  } catch {
    // upstream unavailable
  }

  return [];
}
