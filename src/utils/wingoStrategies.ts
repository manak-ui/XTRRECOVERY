import type {
  PredictorMode,
  StrategyConfigState,
  StrategyId,
  StrategyValidationStats,
  WingoClockMode,
  WingoInterval,
} from '../types';

export interface WingoClock {
  periodId: string;
  secLeft: number;
}

export interface PartnerWingoResultItem {
  issueNumber: string;
  number: number;
  actualResult: 'BIG' | 'SMALL';
}

export type StrategySignalValue = 'BIG' | 'SMALL' | 'NEUTRAL';
export type ConsensusType =
  | 'THREE-WAY AGREEMENT'
  | 'MAJORITY SIGNAL'
  | 'AUTONOMOUS WEIGHTED'
  | 'SINGLE STRATEGY'
  | 'INSUFFICIENT DATA';
export type ConfidenceLevel = 'Low' | 'Medium' | 'High';

export interface StrategyMetricItem {
  label: string;
  value: string;
}

export interface IndividualStrategyAnalysis {
  id: StrategyId;
  name: string;
  active: boolean;
  signal: StrategySignalValue;
  directionalScore: number;
  confidence: number;
  reason: string;
  metrics: StrategyMetricItem[];
}

export interface CombinedEngineAnalysis {
  periodId: string;
  interval: WingoInterval;
  analysisStatus: 'Processing' | 'Completed';
  sampleCount: number;
  insufficientData: boolean;
  dataProblemMessage: string | null;
  activeCount: number;
  agreementCount: number;
  agreementLabel: '0/3' | '1/3' | '2/3' | '3/3';
  consensusType: ConsensusType;
  confidenceLevel: ConfidenceLevel;
  finalSignal: 'BIG' | 'SMALL' | 'INSUFFICIENT DATA';
  selectedApproach: string;
  combinedScore: number;
  suggestedDigit: number;
  suggestedColor: 'GREEN' | 'RED';
  hasViolet: boolean;
  agreeingStrategies: string[];
  disagreeingStrategies: string[];
  neutralStrategies: string[];
  summaryReason: string;
  strategyPerformance: {
    patternBrain: StrategyValidationStats;
    momentumTrend: StrategyValidationStats;
    dragonContrarian: StrategyValidationStats;
  };
  strategies: {
    patternBrain: IndividualStrategyAnalysis;
    momentumTrend: IndividualStrategyAnalysis;
    dragonContrarian: IndividualStrategyAnalysis;
  };
  recentPreview: Array<{
    issueShort: string;
    number: number;
    actualResult: 'BIG' | 'SMALL';
    color: 'GREEN' | 'RED';
  }>;
}

export const PARTNER_WINGO_SLUGS = new Set([
  'yaarwin',
  'tg-dream',
  'jai-club',
  'dm-play',
  'khelv-888',
  '9k-club',
]);

export function isUserAiPassUnlocked(
  user?: {
    aiPredExpiresAt?: string | null;
    aiPassActive?: boolean;
    isAdmin?: boolean;
  } | null,
  nowMs = Date.now()
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.aiPredExpiresAt) {
    const ms = Date.parse(user.aiPredExpiresAt);
    return !Number.isNaN(ms) && ms > nowMs;
  }
  return Boolean(user.aiPassActive);
}

export function getWingoColorFromNumber(num: number): {
  color: 'GREEN' | 'RED';
  hasViolet: boolean;
} {
  const n = Math.max(0, Math.min(9, Math.round(num)));
  const color: 'GREEN' | 'RED' = n % 2 === 1 ? 'GREEN' : 'RED';
  const hasViolet = n === 0 || n === 5;
  return { color, hasViolet };
}

export function getWingoClock(
  gameSlug: string,
  interval: WingoInterval = '1m',
  offsetPeriods = 0,
  clockMode?: WingoClockMode
): WingoClock {
  const now = new Date();
  const stepMs = interval === '30s' ? 30000 : 60000;
  const isPartnerClock =
    clockMode === 'utc-partner-api' ||
    (clockMode !== 'ist-standard' && PARTNER_WINGO_SLUGS.has(gameSlug));

  if (isPartnerClock) {
    const dt = new Date(now.getTime() + offsetPeriods * stepMs);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    if (interval === '30s') {
      const idx =
        dt.getUTCHours() * 120 +
        dt.getUTCMinutes() * 2 +
        Math.floor(dt.getUTCSeconds() / 30) +
        1;
      return {
        periodId: `${y}${m}${d}10005${String(idx).padStart(4, '0')}`,
        secLeft: 30 - (dt.getUTCSeconds() % 30),
      };
    }
    const minuteIndex = dt.getUTCHours() * 60 + dt.getUTCMinutes() + 1;
    return {
      periodId: `${y}${m}${d}10001${String(minuteIndex).padStart(4, '0')}`,
      secLeft: 60 - dt.getUTCSeconds(),
    };
  }

  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600000 + offsetPeriods * stepMs);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  if (interval === '30s') {
    const idx =
      ist.getHours() * 120 +
      ist.getMinutes() * 2 +
      Math.floor(ist.getSeconds() / 30) +
      1;
    return {
      periodId: `${y}${m}${d}10005${String(idx).padStart(4, '0')}`,
      secLeft: 30 - (ist.getSeconds() % 30),
    };
  }
  const minuteIndex = ist.getHours() * 60 + ist.getMinutes() + 1;
  return {
    periodId: `${y}${m}${d}1000${String(minuteIndex).padStart(4, '0')}`,
    secLeft: 60 - ist.getSeconds(),
  };
}

export function getPreviousPeriodId(
  periodId: string,
  gameSlug: string,
  clockMode?: WingoClockMode,
  interval: WingoInterval = '1m'
): string {
  if (/^\d+$/.test(periodId)) {
    if (periodId.endsWith('0001')) {
      return getWingoClock(gameSlug, interval, -1, clockMode).periodId;
    }
    return String(BigInt(periodId) - 1n);
  }
  return getWingoClock(gameSlug, interval, -1, clockMode).periodId;
}

export function filterAndSortPriorDraws(
  recentResults: PartnerWingoResultItem[],
  periodId: string
): PartnerWingoResultItem[] {
  const seen = new Set<string>();
  const filtered: PartnerWingoResultItem[] = [];
  for (const r of recentResults) {
    if (!r || !r.issueNumber || typeof r.number !== 'number' || r.number < 0 || r.number > 9) {
      continue;
    }
    const issue = String(r.issueNumber).trim();
    if (seen.has(issue)) continue;
    if (/^\d+$/.test(periodId) && /^\d+$/.test(issue)) {
      if (issue.length === periodId.length) {
        try {
          if (BigInt(issue) >= BigInt(periodId)) continue;
        } catch {
          if (issue === periodId) continue;
        }
      } else if (issue === periodId) {
        continue;
      }
    } else if (issue === periodId) {
      continue;
    }
    seen.add(issue);
    filtered.push({
      issueNumber: issue,
      number: Math.round(r.number),
      actualResult: Math.round(r.number) >= 5 ? 'BIG' : 'SMALL',
    });
  }

  return filtered
    .sort((a, b) => {
      if (/^\d+$/.test(a.issueNumber) && /^\d+$/.test(b.issueNumber)) {
        const diff = BigInt(b.issueNumber) - BigInt(a.issueNumber);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
      return b.issueNumber.localeCompare(a.issueNumber);
    })
    .slice(0, 40);
}

function getStreakLength(history: PartnerWingoResultItem[]): number {
  if (history.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < history.length; i += 1) {
    if (history[i].actualResult === history[0].actualResult) streak += 1;
    else break;
  }
  return streak;
}

function computeBestDigitForDirection(
  history: PartnerWingoResultItem[],
  direction: 'BIG' | 'SMALL'
): { digit: number; color: 'GREEN' | 'RED'; hasViolet: boolean; overdueColor: 'GREEN' | 'RED' } {
  const candidates = direction === 'BIG' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  if (history.length === 0) {
    const d = candidates[0];
    const meta = getWingoColorFromNumber(d);
    return { digit: d, color: meta.color, hasViolet: meta.hasViolet, overdueColor: meta.color };
  }

  const colorWindow = history.slice(0, 10);
  let greenCount = 0;
  let redCount = 0;
  let roundsSinceViolet = colorWindow.length;
  colorWindow.forEach((item, idx) => {
    const c = getWingoColorFromNumber(item.number);
    if (c.color === 'GREEN') greenCount += 1;
    else redCount += 1;
    if (c.hasViolet && roundsSinceViolet === colorWindow.length) {
      roundsSinceViolet = idx;
    }
  });
  const overdueColor: 'GREEN' | 'RED' = greenCount <= redCount ? 'GREEN' : 'RED';
  const violetPressure = roundsSinceViolet >= 6;

  const newest = history[0];
  const prev = history[1] || newest;
  const stepDelta = newest.number - prev.number;
  const harmonicTarget = ((newest.number + stepDelta) % 10 + 10) % 10;

  let bestDigit = candidates[0];
  let bestScore = -999;

  for (const d of candidates) {
    let score = 0;
    const lastIdx = history.findIndex((item) => item.number === d);
    const gap = lastIdx === -1 ? history.length + 3 : lastIdx;
    score += gap === 0 ? -4.5 : Math.min(gap, 12) * 0.58;
    const freqInHistory = history.filter((item) => item.number === d).length;
    score += Math.max(0, 4 - freqInHistory) * 0.45;
    const dist = Math.abs(d - harmonicTarget);
    score += Math.max(0, 3 - dist) * 0.55;
    const dColor = getWingoColorFromNumber(d);
    if (dColor.color === overdueColor) score += 1.35;
    if (violetPressure && dColor.hasViolet) score += 1.15;
    if (!violetPressure && dColor.hasViolet) score -= 0.45;
    if (score > bestScore) {
      bestScore = score;
      bestDigit = d;
    }
  }

  const meta = getWingoColorFromNumber(bestDigit);
  return { digit: bestDigit, color: meta.color, hasViolet: meta.hasViolet, overdueColor };
}

/**
 * Strategy 1: Pattern Brain AI
 * Reads ABAB zig-zags, >=4x streak breaks, 2-2 mirror blocks, 10-round equilibrium,
 * BIG/SMALL frequency, empirical Markov/Bigram, and color/digit gaps.
 */
export function evaluatePatternBrainStrategy(
  history: PartnerWingoResultItem[],
  active = true
): IndividualStrategyAnalysis {
  if (history.length < 6) {
    return {
      id: 'pattern-ai',
      name: 'Pattern Brain AI',
      active,
      signal: 'NEUTRAL',
      directionalScore: 0,
      confidence: 0,
      reason: `Need at least 6 real draws (currently ${history.length}).`,
      metrics: [
        { label: 'Sample', value: `${history.length} draws` },
        { label: 'Status', value: 'Insufficient Data' },
      ],
    };
  }

  const window = history.slice(0, 14);
  const newest = window[0];
  const signOfNewest = newest.actualResult === 'BIG' ? 1 : -1;
  const streakLen = getStreakLength(window);

  let flips = 0;
  const zigLen = Math.min(8, window.length - 1);
  for (let i = 0; i < zigLen; i += 1) {
    if (window[i].actualResult !== window[i + 1].actualResult) flips += 1;
  }
  const zigRatio = zigLen > 0 ? flips / zigLen : 0;

  const hasDoubleBlock =
    window.length >= 4 &&
    window[0].actualResult === window[1].actualResult &&
    window[2].actualResult === window[3].actualResult &&
    window[0].actualResult !== window[2].actualResult;

  const slice10 = history.slice(0, 10);
  const big10 = slice10.filter((x) => x.actualResult === 'BIG').length;
  const small10 = slice10.length - big10;
  const bigAll = history.filter((x) => x.actualResult === 'BIG').length;
  const smallAll = history.length - bigAll;

  let green10 = 0;
  let red10 = 0;
  slice10.forEach((item) => {
    if (getWingoColorFromNumber(item.number).color === 'GREEN') green10 += 1;
    else red10 += 1;
  });

  // Max missing digit gap in history
  let maxGapDigit = 0;
  let maxGapVal = 0;
  for (let d = 0; d <= 9; d += 1) {
    const idx = history.findIndex((item) => item.number === d);
    const gap = idx === -1 ? history.length : idx;
    if (gap > maxGapVal) {
      maxGapVal = gap;
      maxGapDigit = d;
    }
  }

  // Empirical 1st & 2nd order Markov
  const chrono = [...history].reverse();
  let sameToSame = 0;
  let sameToFlip = 0;
  let bigramBig = 0;
  let bigramSmall = 0;
  const latestPair =
    window.length >= 2 ? `${window[1].actualResult[0]}${window[0].actualResult[0]}` : '';

  for (let i = 0; i < chrono.length - 1; i += 1) {
    const curr = chrono[i].actualResult;
    const next = chrono[i + 1].actualResult;
    if (curr === newest.actualResult) {
      if (next === newest.actualResult) sameToSame += 1;
      else sameToFlip += 1;
    }
    if (i >= 1 && latestPair) {
      const pair = `${chrono[i - 1].actualResult[0]}${chrono[i].actualResult[0]}`;
      if (pair === latestPair) {
        if (next === 'BIG') bigramBig += 1;
        else bigramSmall += 1;
      }
    }
  }

  let score = 0;
  const reasons: string[] = [];

  const total1st = sameToSame + sameToFlip;
  if (total1st >= 4) {
    const stayEdge = (sameToSame - sameToFlip) / total1st;
    score += signOfNewest * stayEdge * 1.4;
  }

  const total2nd = bigramBig + bigramSmall;
  if (total2nd >= 2) {
    const bigramEdge = (bigramBig - bigramSmall) / total2nd;
    score += bigramEdge * 1.8;
  }

  if (zigRatio >= 0.72 && zigLen >= 5) {
    score -= signOfNewest * 2.6;
    reasons.push(`ABAB zig-zag ${Math.round(zigRatio * 100)}%`);
  } else if (streakLen >= 4) {
    score -= signOfNewest * (2.4 + Math.min(streakLen - 4, 3) * 0.45);
    reasons.push(`${streakLen}x streak break`);
  } else if (hasDoubleBlock && streakLen === 2) {
    score -= signOfNewest * 2.1;
    reasons.push('2-2 mirror block flip');
  } else if (streakLen === 2 && total2nd >= 2 && bigramBig !== bigramSmall) {
    const pairFollow =
      (newest.actualResult === 'BIG' && bigramBig > bigramSmall) ||
      (newest.actualResult === 'SMALL' && bigramSmall > bigramBig);
    score += signOfNewest * (pairFollow ? 1.4 : -1.1);
    reasons.push(pairFollow ? `Bigram ${latestPair} continuation` : `Bigram ${latestPair} turn`);
  } else if (streakLen === 3) {
    score -= signOfNewest * 1.5;
    reasons.push('3x streak break watch');
  }

  // 10-round equilibrium & overall frequency balance
  const eq10 = (small10 - big10) / Math.max(1, slice10.length);
  const eqAll = (smallAll - bigAll) / Math.max(1, history.length);
  score += eq10 * 1.9 + eqAll * 1.1;
  if (Math.abs(big10 - small10) >= 4) {
    reasons.push(`10R skew ${big10}B/${small10}S`);
  }

  const absScore = Math.abs(score);
  const signal: StrategySignalValue = absScore < 0.35 ? 'NEUTRAL' : score > 0 ? 'BIG' : 'SMALL';
  const confidence =
    signal === 'NEUTRAL'
      ? Math.round(45 + absScore * 15)
      : Math.min(94, Math.max(54, Math.round(54 + absScore * 9.5 + Math.min(history.length, 30) * 0.2)));

  return {
    id: 'pattern-ai',
    name: 'Pattern Brain AI',
    active,
    signal,
    directionalScore: Math.round(score * 100) / 100,
    confidence,
    reason:
      reasons.length > 0
        ? `${reasons.join(' · ')} (${big10}B/${small10}S last 10)`
        : signal === 'NEUTRAL'
        ? `Balanced ${big10}B/${small10}S distribution · mild pattern edge`
        : `Equilibrium & Markov read (${bigAll}B/${smallAll}S overall)`,
    metrics: [
      { label: 'Zig-Zag', value: `${Math.round(zigRatio * 100)}%` },
      { label: '2-2 Mirror', value: hasDoubleBlock ? 'Detected' : 'None' },
      { label: '10R Split', value: `${big10}B / ${small10}S` },
      { label: 'Color 10R', value: `${green10}G / ${red10}R` },
      { label: 'Max Digit Gap', value: `#${maxGapDigit} (${maxGapVal}r)` },
    ],
  };
}

/**
 * Strategy 2: Momentum Trend Follow
 * Reads recent BIG/SMALL streaks, short-window velocity (last 3 / 5 / 8),
 * and trend strength acceleration vs deceleration.
 */
export function evaluateMomentumTrendStrategy(
  history: PartnerWingoResultItem[],
  active = true
): IndividualStrategyAnalysis {
  if (history.length < 6) {
    return {
      id: 'trend-follow',
      name: 'Momentum Trend Follow',
      active,
      signal: 'NEUTRAL',
      directionalScore: 0,
      confidence: 0,
      reason: `Need at least 6 real draws (currently ${history.length}).`,
      metrics: [
        { label: 'Sample', value: `${history.length} draws` },
        { label: 'Status', value: 'Insufficient Data' },
      ],
    };
  }

  const newest = history[0];
  const signOfNewest = newest.actualResult === 'BIG' ? 1 : -1;
  const streakLen = getStreakLength(history);

  const w3 = history.slice(0, 3);
  const w5 = history.slice(0, 5);
  const w8 = history.slice(0, 8);

  const vel = (arr: PartnerWingoResultItem[]) => {
    if (arr.length === 0) return 0;
    const b = arr.filter((x) => x.actualResult === 'BIG').length;
    const s = arr.length - b;
    return (b - s) / arr.length; // +1 all BIG, -1 all SMALL
  };

  const v3 = vel(w3);
  const v5 = vel(w5);
  const v8 = vel(w8);
  const strengthShift = Math.abs(v3) - Math.abs(v8);

  let flips5 = 0;
  for (let i = 0; i < w5.length - 1; i += 1) {
    if (w5[i].actualResult !== w5[i + 1].actualResult) flips5 += 1;
  }
  const choppyTrend = flips5 >= 4;

  let score = 0;
  let trendNote = '';

  if (choppyTrend) {
    score = v3 * 0.25;
    trendNote = 'Choppy 5-round flips · trend momentum flat';
  } else if (streakLen >= 6) {
    score = signOfNewest * 0.35;
    trendNote = `${streakLen}x extended run · momentum overstretched`;
  } else {
    score = v3 * 1.9 + v5 * 1.5 + v8 * 0.9 + (streakLen >= 2 ? signOfNewest * 1.0 : 0);
    if (strengthShift > 0.15) {
      score += (v3 >= 0 ? 1 : -1) * 0.45;
      trendNote = `Accelerating ${v3 >= 0 ? 'BIG' : 'SMALL'} momentum`;
    } else if (strengthShift < -0.2) {
      score *= 0.75;
      trendNote = `Cooling ${v5 >= 0 ? 'BIG' : 'SMALL'} momentum`;
    } else {
      trendNote = `Steady ${streakLen}x ${newest.actualResult} run`;
    }
  }

  const absScore = Math.abs(score);
  const signal: StrategySignalValue = absScore < 0.45 ? 'NEUTRAL' : score > 0 ? 'BIG' : 'SMALL';
  const confidence =
    signal === 'NEUTRAL'
      ? Math.round(44 + absScore * 15)
      : Math.min(93, Math.max(54, Math.round(53 + absScore * 8.5 + (streakLen >= 2 ? 3 : 0))));

  const strengthLabel =
    absScore >= 2.6 ? 'Strong' : absScore >= 1.3 ? 'Moderate' : 'Weak';

  return {
    id: 'trend-follow',
    name: 'Momentum Trend Follow',
    active,
    signal,
    directionalScore: Math.round(score * 100) / 100,
    confidence,
    reason: trendNote,
    metrics: [
      { label: 'Active Streak', value: `${streakLen}x ${newest.actualResult}` },
      { label: '3R / 5R Vel', value: `${Math.round(v3 * 100)}% / ${Math.round(v5 * 100)}%` },
      { label: '8R Velocity', value: `${Math.round(v8 * 100)}%` },
      {
        label: 'Trend Shift',
        value: strengthShift > 0.12 ? 'Strengthening' : strengthShift < -0.12 ? 'Weakening' : 'Stable',
      },
      { label: 'Strength', value: strengthLabel },
    ],
  };
}

/**
 * Strategy 3: Dragon Contrarian Reversal
 * Detects repeated same-side runs, calculates empirical mean-reversion pressure,
 * and measures actual flip probability after runs in the current dataset.
 */
export function evaluateDragonContrarianStrategy(
  history: PartnerWingoResultItem[],
  active = true
): IndividualStrategyAnalysis {
  if (history.length < 6) {
    return {
      id: 'contrarian',
      name: 'Dragon Contrarian Reversal',
      active,
      signal: 'NEUTRAL',
      directionalScore: 0,
      confidence: 0,
      reason: `Need at least 6 real draws (currently ${history.length}).`,
      metrics: [
        { label: 'Sample', value: `${history.length} draws` },
        { label: 'Status', value: 'Insufficient Data' },
      ],
    };
  }

  const newest = history[0];
  const oppositeOfNewest: 'BIG' | 'SMALL' = newest.actualResult === 'BIG' ? 'SMALL' : 'BIG';
  const signOfNewest = newest.actualResult === 'BIG' ? 1 : -1;
  const streakLen = getStreakLength(history);

  const slice10 = history.slice(0, 10);
  const big10 = slice10.filter((x) => x.actualResult === 'BIG').length;
  const small10 = slice10.length - big10;

  const slice20 = history.slice(0, 20);
  const big20 = slice20.filter((x) => x.actualResult === 'BIG').length;
  const small20 = slice20.length - big20;

  // Empirical flip rate in history after streaks of length >= targetLen
  const chrono = [...history].reverse();
  const minRunForMatch = streakLen >= 2 ? Math.min(streakLen, 3) : 1;
  let matchedRuns = 0;
  let flippedAfterMatch = 0;
  let run = 0;
  for (let i = 0; i < chrono.length - 1; i += 1) {
    if (i === 0 || chrono[i].actualResult === chrono[i - 1].actualResult) run += 1;
    else run = 1;
    if (chrono[i].actualResult === newest.actualResult && run >= minRunForMatch) {
      matchedRuns += 1;
      if (chrono[i + 1].actualResult !== newest.actualResult) flippedAfterMatch += 1;
    }
  }
  const empiricalFlipRate = matchedRuns > 0 ? flippedAfterMatch / matchedRuns : 0.5;

  let score = 0;
  let reason = '';

  const skew10 = (small10 - big10) / Math.max(1, slice10.length);
  const skew20 = (small20 - big20) / Math.max(1, slice20.length);

  if (streakLen >= 4) {
    score = -signOfNewest * (2.6 + Math.min(streakLen - 4, 3) * 0.55) + skew10 * 1.1;
    reason = `${streakLen}x same-side run -> high exhaustion flip toward ${oppositeOfNewest}`;
  } else if (streakLen === 3) {
    score = -signOfNewest * 2.1 + (empiricalFlipRate - 0.5) * -signOfNewest * 1.4 + skew10 * 0.9;
    reason = `3x ${newest.actualResult} run · mean-reversion flip pressure (${Math.round(empiricalFlipRate * 100)}% flip rate)`;
  } else if (streakLen === 2 && Math.abs(big10 - small10) >= 3) {
    score = -signOfNewest * 1.35 + skew10 * 1.4;
    reason = `2x ${newest.actualResult} with ${big10}B/${small10}S skew`;
  } else if (Math.abs(big10 - small10) >= 4 || Math.abs(big20 - small20) >= 6) {
    score = skew10 * 2.2 + skew20 * 1.4;
    reason = `Mean reversion from ${big10}B/${small10}S (10R) · ${big20}B/${small20}S (20R)`;
  } else {
    score = (skew10 * 0.6 + skew20 * 0.4) * 0.5;
    reason = `Balanced ${big10}B/${small10}S (${streakLen}x run) · mild mean-reversion bias`;
  }

  const absScore = Math.abs(score);
  const signal: StrategySignalValue = absScore < 0.55 ? 'NEUTRAL' : score > 0 ? 'BIG' : 'SMALL';
  const confidence =
    signal === 'NEUTRAL'
      ? Math.round(42 + absScore * 15)
      : Math.min(
          94,
          Math.max(
            55,
            Math.round(
              54 +
                absScore * 8.5 +
                (streakLen >= 3 ? 4 : 0) +
                (matchedRuns >= 2 && empiricalFlipRate >= 0.6 ? 4 : 0)
            )
          )
        );

  return {
    id: 'contrarian',
    name: 'Dragon Contrarian Reversal',
    active,
    signal,
    directionalScore: Math.round(score * 100) / 100,
    confidence,
    reason,
    metrics: [
      { label: 'Run Length', value: `${streakLen}x ${newest.actualResult}` },
      { label: '10R / 20R Skew', value: `${big10}B-${small10}S / ${big20}B-${small20}S` },
      {
        label: 'Hist Flip Rate',
        value: matchedRuns > 0 ? `${Math.round(empiricalFlipRate * 100)}% (${matchedRuns}x)` : 'N/A',
      },
      {
        label: 'Reversal Bias',
        value: signal === 'NEUTRAL' ? 'Neutral' : `Flip -> ${signal}`,
      },
    ],
  };
}

/**
 * Walk-forward backtester across prior draws without lookahead.
 * Produces empirical accuracy & dynamic weights (0.55 - 1.65) for autonomous selection.
 */
export function evaluateHistoricalStrategyPerformance(
  history: PartnerWingoResultItem[]
): {
  patternBrain: StrategyValidationStats;
  momentumTrend: StrategyValidationStats;
  dragonContrarian: StrategyValidationStats;
} {
  const empty = (): StrategyValidationStats => ({
    wins: 0,
    losses: 0,
    evaluated: 0,
    hitRate: null,
    weight: 1.0,
  });

  if (history.length < 7) {
    return {
      patternBrain: empty(),
      momentumTrend: empty(),
      dragonContrarian: empty(),
    };
  }

  const chrono = [...history].reverse(); // oldest -> newest
  const tallies = {
    patternBrain: { wins: 0, losses: 0, evaluated: 0 },
    momentumTrend: { wins: 0, losses: 0, evaluated: 0 },
    dragonContrarian: { wins: 0, losses: 0, evaluated: 0 },
  };

  for (let i = 6; i < chrono.length; i += 1) {
    const priorDesc = chrono.slice(0, i).reverse();
    const actual = chrono[i].actualResult;

    const pSig = evaluatePatternBrainStrategy(priorDesc, true).signal;
    if (pSig === 'BIG' || pSig === 'SMALL') {
      tallies.patternBrain.evaluated += 1;
      if (pSig === actual) tallies.patternBrain.wins += 1;
      else tallies.patternBrain.losses += 1;
    }

    const mSig = evaluateMomentumTrendStrategy(priorDesc, true).signal;
    if (mSig === 'BIG' || mSig === 'SMALL') {
      tallies.momentumTrend.evaluated += 1;
      if (mSig === actual) tallies.momentumTrend.wins += 1;
      else tallies.momentumTrend.losses += 1;
    }

    const dSig = evaluateDragonContrarianStrategy(priorDesc, true).signal;
    if (dSig === 'BIG' || dSig === 'SMALL') {
      tallies.dragonContrarian.evaluated += 1;
      if (dSig === actual) tallies.dragonContrarian.wins += 1;
      else tallies.dragonContrarian.losses += 1;
    }
  }

  const finalize = (t: { wins: number; losses: number; evaluated: number }): StrategyValidationStats => {
    const hitRate = t.evaluated > 0 ? Math.round((t.wins / t.evaluated) * 100) : null;
    if (t.evaluated < 2) {
      return { ...t, hitRate, weight: 1.0 };
    }
    const acc = t.wins / t.evaluated;
    const shrink = Math.min(1, t.evaluated / 6);
    const rawWeight = 1.0 + (acc - 0.5) * 1.4 * shrink;
    const clampedWeight = Math.min(1.65, Math.max(0.55, Math.round(rawWeight * 100) / 100));
    return {
      ...t,
      hitRate,
      weight: clampedWeight,
    };
  };

  return {
    patternBrain: finalize(tallies.patternBrain),
    momentumTrend: finalize(tallies.momentumTrend),
    dragonContrarian: finalize(tallies.dragonContrarian),
  };
}

export function normalizeStrategyConfig(
  cfg?: StrategyConfigState | null,
  fallbackPredictorMode: PredictorMode = 'pattern-ai'
): StrategyConfigState {
  if (!cfg) {
    return {
      patternBrainEnabled: fallbackPredictorMode === 'pattern-ai',
      momentumTrendEnabled: fallbackPredictorMode === 'trend-follow',
      dragonContrarianEnabled: fallbackPredictorMode === 'contrarian',
      allThreeStrategiesActive: false,
    };
  }
  const patternBrainEnabled = Boolean(cfg.patternBrainEnabled);
  const momentumTrendEnabled = Boolean(cfg.momentumTrendEnabled);
  const dragonContrarianEnabled = Boolean(cfg.dragonContrarianEnabled);
  const allThreeStrategiesActive =
    patternBrainEnabled && momentumTrendEnabled && dragonContrarianEnabled;
  return {
    patternBrainEnabled,
    momentumTrendEnabled,
    dragonContrarianEnabled,
    allThreeStrategiesActive,
  };
}

export function runCombinedWingoEngine(
  recentResults: PartnerWingoResultItem[],
  periodId: string,
  options?: {
    interval?: WingoInterval;
    strategyConfig?: StrategyConfigState | null;
    fallbackPredictorMode?: PredictorMode;
  }
): CombinedEngineAnalysis {
  const interval: WingoInterval = options?.interval === '30s' ? '30s' : '1m';
  const stratCfg = normalizeStrategyConfig(
    options?.strategyConfig,
    options?.fallbackPredictorMode || 'pattern-ai'
  );
  const history = filterAndSortPriorDraws(recentResults, periodId);
  const insufficientData = history.length < 6;
  const strategyPerformance = evaluateHistoricalStrategyPerformance(history);

  const patternBrain = evaluatePatternBrainStrategy(history, stratCfg.patternBrainEnabled);
  const momentumTrend = evaluateMomentumTrendStrategy(history, stratCfg.momentumTrendEnabled);
  const dragonContrarian = evaluateDragonContrarianStrategy(
    history,
    stratCfg.dragonContrarianEnabled
  );

  const allList = [patternBrain, momentumTrend, dragonContrarian];
  const activeList = allList.filter((s) => s.active);
  const activeCount = activeList.length;
  const effectiveList = activeCount > 0 ? activeList : allList;

  const weightFor = (id: StrategyId): number => {
    if (id === 'pattern-ai') return strategyPerformance.patternBrain.weight;
    if (id === 'trend-follow') return strategyPerformance.momentumTrend.weight;
    return strategyPerformance.dragonContrarian.weight;
  };
  const hitRateFor = (id: StrategyId): number => {
    const hr =
      id === 'pattern-ai'
        ? strategyPerformance.patternBrain.hitRate
        : id === 'trend-follow'
        ? strategyPerformance.momentumTrend.hitRate
        : strategyPerformance.dragonContrarian.hitRate;
    return hr ?? 50;
  };

  let bigVotes = 0;
  let smallVotes = 0;
  let scoreSum = 0;
  let weightedScoreSum = 0;
  let weightTotal = 0;

  for (const s of effectiveList) {
    const w = weightFor(s.id);
    if (s.signal === 'BIG') bigVotes += 1;
    else if (s.signal === 'SMALL') smallVotes += 1;
    scoreSum += s.directionalScore;
    weightedScoreSum += s.directionalScore * w;
    weightTotal += w;
  }

  const avgScore =
    weightTotal > 0
      ? Math.round((weightedScoreSum / weightTotal) * 100) / 100
      : effectiveList.length > 0
      ? Math.round((scoreSum / effectiveList.length) * 100) / 100
      : 0;

  let finalSignal: 'BIG' | 'SMALL' | 'INSUFFICIENT DATA' = 'INSUFFICIENT DATA';
  let consensusType: ConsensusType = 'INSUFFICIENT DATA';
  let confidenceLevel: ConfidenceLevel = 'Low';
  let agreementCount = 0;
  let selectedApproach = 'Autonomous Multi-Strategy Selector';
  let dataProblemMessage: string | null = null;

  if (insufficientData) {
    finalSignal = 'INSUFFICIENT DATA';
    consensusType = 'INSUFFICIENT DATA';
    confidenceLevel = 'Low';
    agreementCount = 0;
    selectedApproach = 'Insufficient Data Guard';
    dataProblemMessage = `Only ${history.length} verified ${interval.toUpperCase()} draws loaded (minimum 6 required).`;
  } else if (
    effectiveList.length === 1 &&
    (effectiveList[0].signal === 'BIG' || effectiveList[0].signal === 'SMALL')
  ) {
    const only = effectiveList[0];
    finalSignal = only.signal === 'BIG' ? 'BIG' : 'SMALL';
    consensusType = 'SINGLE STRATEGY';
    confidenceLevel = only.confidence >= 76 ? 'High' : only.confidence >= 62 ? 'Medium' : 'Low';
    agreementCount = 1;
    selectedApproach = only.name;
  } else if (bigVotes === 3 || smallVotes === 3) {
    finalSignal = bigVotes === 3 ? 'BIG' : 'SMALL';
    consensusType = 'THREE-WAY AGREEMENT';
    confidenceLevel = 'High';
    agreementCount = 3;
    selectedApproach = '3/3 All-Strategy Fusion';
  } else if (
    (bigVotes >= 2 && bigVotes > smallVotes) ||
    (smallVotes >= 2 && smallVotes > bigVotes)
  ) {
    finalSignal = bigVotes > smallVotes ? 'BIG' : 'SMALL';
    consensusType = 'MAJORITY SIGNAL';
    const opposingVotes = finalSignal === 'BIG' ? smallVotes : bigVotes;
    confidenceLevel = opposingVotes === 0 && Math.abs(avgScore) >= 1.35 ? 'High' : 'Medium';
    agreementCount = Math.max(bigVotes, smallVotes);
    const leadStrat = [...effectiveList]
      .filter((s) => s.signal === finalSignal)
      .sort((a, b) => hitRateFor(b.id) - hitRateFor(a.id))[0];
    selectedApproach = leadStrat
      ? `Majority Consensus (${leadStrat.name})`
      : '2/3 Majority Consensus';
  } else {
    // Autonomous weighted decision when strategies split or lean neutral (>=6 draws verified)
    const rankedDirectional = [...effectiveList]
      .map((s) => ({
        strat: s,
        weightedMag: Math.abs(s.directionalScore) * weightFor(s.id),
        hitRate: hitRateFor(s.id),
      }))
      .sort((a, b) => b.weightedMag - a.weightedMag || b.hitRate - a.hitRate);

    if (Math.abs(weightedScoreSum) >= 0.08) {
      finalSignal = weightedScoreSum >= 0 ? 'BIG' : 'SMALL';
    } else if (
      rankedDirectional[0] &&
      Math.abs(rankedDirectional[0].strat.directionalScore) >= 0.05
    ) {
      finalSignal = rankedDirectional[0].strat.directionalScore >= 0 ? 'BIG' : 'SMALL';
    } else {
      // Deterministic empirical balance + newest transition tie-breaker on >=6 real draws
      const big10 = history.slice(0, 10).filter((r) => r.actualResult === 'BIG').length;
      const small10 = Math.min(10, history.length) - big10;
      if (big10 !== small10) {
        finalSignal = small10 > big10 ? 'BIG' : 'SMALL';
      } else {
        finalSignal = history[0].actualResult === 'BIG' ? 'SMALL' : 'BIG';
      }
    }

    const alignedTop = rankedDirectional.find(
      (item) =>
        item.strat.signal === finalSignal ||
        (finalSignal === 'BIG' && item.strat.directionalScore > 0) ||
        (finalSignal === 'SMALL' && item.strat.directionalScore < 0)
    );
    const chosen = alignedTop?.strat || rankedDirectional[0]?.strat || patternBrain;
    selectedApproach = `Autonomous Weighted -> ${chosen.name}`;
    consensusType = 'AUTONOMOUS WEIGHTED';
    agreementCount = Math.max(
      1,
      effectiveList.filter((s) => s.signal === finalSignal).length
    );
    confidenceLevel = Math.abs(avgScore) >= 1.25 ? 'Medium' : 'Low';
  }

  const agreementLabel = `${Math.min(3, agreementCount)}/3` as '0/3' | '1/3' | '2/3' | '3/3';
  const agreeingStrategies: string[] = [];
  const disagreeingStrategies: string[] = [];
  const neutralStrategies: string[] = [];

  for (const s of effectiveList) {
    if (s.signal === 'NEUTRAL') {
      neutralStrategies.push(s.name);
    } else if (finalSignal === 'BIG' || finalSignal === 'SMALL') {
      if (s.signal === finalSignal) agreeingStrategies.push(s.name);
      else disagreeingStrategies.push(s.name);
    }
  }

  const digitDirection: 'BIG' | 'SMALL' =
    finalSignal === 'BIG' || finalSignal === 'SMALL'
      ? finalSignal
      : avgScore >= 0
      ? 'BIG'
      : 'SMALL';
  const digitMeta = computeBestDigitForDirection(history, digitDirection);

  let summaryReason = '';
  if (insufficientData) {
    summaryReason = dataProblemMessage || `Need 6 verified draws (${history.length}/6 loaded).`;
  } else if (consensusType === 'THREE-WAY AGREEMENT') {
    summaryReason = `3/3 strategies unanimously confirm ${finalSignal} across ${history.length} verified draws (weighted score ${avgScore >= 0 ? '+' : ''}${avgScore}).`;
  } else if (consensusType === 'MAJORITY SIGNAL') {
    summaryReason = `Majority consensus picks ${finalSignal} (${agreeingStrategies.join(' + ')} · ${selectedApproach}).`;
  } else if (consensusType === 'SINGLE STRATEGY') {
    summaryReason = `${effectiveList[0].name} signals ${finalSignal}: ${effectiveList[0].reason}.`;
  } else {
    summaryReason = `Autonomous backtest-weighted decision picks ${finalSignal} via ${selectedApproach} (Pattern ${strategyPerformance.patternBrain.hitRate ?? '—'}%, Momentum ${strategyPerformance.momentumTrend.hitRate ?? '—'}%, Contrarian ${strategyPerformance.dragonContrarian.hitRate ?? '—'}%).`;
  }

  return {
    periodId,
    interval,
    analysisStatus: 'Completed',
    sampleCount: history.length,
    insufficientData,
    dataProblemMessage,
    activeCount,
    agreementCount,
    agreementLabel,
    consensusType,
    confidenceLevel,
    finalSignal,
    selectedApproach,
    combinedScore: avgScore,
    suggestedDigit: digitMeta.digit,
    suggestedColor: digitMeta.color,
    hasViolet: digitMeta.hasViolet,
    agreeingStrategies,
    disagreeingStrategies,
    neutralStrategies,
    summaryReason,
    strategyPerformance,
    strategies: {
      patternBrain,
      momentumTrend,
      dragonContrarian,
    },
    recentPreview: history.slice(0, 6).map((r) => ({
      issueShort: r.issueNumber.slice(-4),
      number: r.number,
      actualResult: r.actualResult,
      color: getWingoColorFromNumber(r.number).color,
    })),
  };
}

