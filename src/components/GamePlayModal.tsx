import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Gamepad2,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Trash2,
  ArrowRight,
  RotateCcw,
  Lock,
  Clock,
  Brain,
  Power,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';
import { ApiError, apiRequest, formatCurrency } from '../api';
import type {
  AiPlanId,
  AiPredictionHistoryItem,
  GameSummary,
  ModMenuConfig,
  ModMenuRoundRecord,
  PlatformConfig,
  UserProfile,
  WingoInterval,
} from '../types';
import {
  fetchAiPredictionHistory,
  fetchPartnerWingoIssue,
  fetchPartnerWingoResults,
  formatRemainingDuration,
  getPredictionForPeriod,
  getPreviousPeriodId,
  getWingoClock,
  isFeatureUnlocked,
  isUserAiPassUnlocked,
  normalizeStrategyConfig,
  PARTNER_WINGO_SLUGS,
  requestAiWingoPrediction,
  resolveMenuTheme,
  type PartnerWingoResultItem,
  type PredictionFeature,
  type WingoClock,
  type WingoPredictionResult,
} from '../utils/wingo';
import { PredictionUnlockModal } from './PredictionUnlockModal';
import { AiPassComparisonModal } from './AiPassComparisonModal';
import { AiPassBadge } from './AiPassBadge';

interface GamePlayModalProps {
  game: GameSummary;
  user: UserProfile | null;
  platformConfig?: PlatformConfig | null;
  recentWingoResults?: PartnerWingoResultItem[];
  onClose: () => void;
  onRequireAuth: () => void;
  onGoToWallet: (suggestedAmount?: number) => void;
  onUserUpdated: (user: UserProfile) => void;
  onGameUnlocked: () => void;
}

interface RoundHistoryItem {
  id: string;
  periodId: string;
  signal: 'BIG' | 'SMALL';
  level: number;
  maxLevels: number;
  betAmount: number;
  outcome: 'WIN' | 'LOSS' | 'STOP';
  pnlDelta: number;
  recordedAt: string;
}



function computeLevelSplit(
  amount: number,
  levelsCount: number,
  mode: 'progressive' | 'equal'
): number[] {
  const amt = Math.max(10, Math.round(amount));
  const count = Math.min(5, Math.max(1, levelsCount));
  const weights: number[] = [];
  let sumW = 0;
  for (let i = 0; i < count; i += 1) {
    const w = mode === 'equal' ? 1 : Math.pow(2, i);
    weights.push(w);
    sumW += w;
  }

  const bets: number[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i += 1) {
    if (i === count - 1) {
      bets.push(Math.max(1, amt - allocated));
    } else {
      const part = Math.max(1, Math.floor((amt * weights[i]) / sumW));
      bets.push(part);
      allocated += part;
    }
  }
  return bets;
}

export const GamePlayModal: React.FC<GamePlayModalProps> = ({
  game,
  user,
  platformConfig,
  recentWingoResults,
  onClose,
  onRequireAuth,
  onGoToWallet,
  onUserUpdated,
  onGameUnlocked,
}) => {
  const [activeModConfig, setActiveModConfig] = useState<ModMenuConfig | undefined>(
    game.modMenuConfig
  );
  const theme = useMemo(
    () => resolveMenuTheme(activeModConfig, game.name, game.slug),
    [activeModConfig, game.name, game.slug]
  );
  const menuEnabled =
    activeModConfig?.enabled !== false && activeModConfig?.menuType !== 'none';
  const menuType = activeModConfig?.menuType || 'wingo-full';
  const clockMode = activeModConfig?.clockMode;
  const showLevelSplit = activeModConfig?.showLevelSplit !== false;
  const showManualHistory = activeModConfig?.showManualHistory !== false;
  const showColorNumberPred = activeModConfig?.showColorNumberPred !== false;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientFunds, setInsufficientFunds] = useState(false);

  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const [activePane, setActivePane] = useState<'game' | 'menu'>('game');
  const [unlockModalFeature, setUnlockModalFeature] = useState<PredictionFeature | null>(null);
  const [unlockPlanId, setUnlockPlanId] = useState<AiPlanId>('weekly');
  const [showAiComparePopup, setShowAiComparePopup] = useState(false);

  const [sessionActive, setSessionActive] = useState(false);
  const [depositInput, setDepositInput] = useState('100');
  const [baseDeposit, setBaseDeposit] = useState(100);
  const [maxLevels, setMaxLevels] = useState(5);
  const [splitMode, setSplitMode] = useState<'progressive' | 'equal'>('progressive');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [totalLoss, setTotalLoss] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>([]);

  const isPartnerWingoGame =
    clockMode === 'utc-partner-api' ||
    (clockMode !== 'ist-standard' && PARTNER_WINGO_SLUGS.has(game.slug));

  const [wingoInterval, setWingoInterval] = useState<WingoInterval>(() => {
    try {
      return window.localStorage.getItem('kwg_wingo_interval') === '30s' ? '30s' : '1m';
    } catch {
      return '1m';
    }
  });
  const wingoIntervalRef = useRef<WingoInterval>(wingoInterval);
  wingoIntervalRef.current = wingoInterval;

  const [resultsByInterval, setResultsByInterval] = useState<
    Record<WingoInterval, PartnerWingoResultItem[]>
  >(() => ({
    '30s': [],
    '1m': recentWingoResults || [],
  }));
  useEffect(() => {
    if (recentWingoResults && recentWingoResults.length > 0) {
      setResultsByInterval((prev) => ({
        ...prev,
        '1m': recentWingoResults,
      }));
    }
  }, [recentWingoResults]);

  const localRecentResults = resultsByInterval[wingoInterval] || [];
  const resultsByIntervalRef = useRef(resultsByInterval);
  resultsByIntervalRef.current = resultsByInterval;

  const predictorMode = platformConfig?.predictorMode || 'pattern-ai';
  const strategyConfig = useMemo(
    () => normalizeStrategyConfig(platformConfig?.strategyConfig, predictorMode),
    [platformConfig?.strategyConfig, predictorMode]
  );
  const stratKey = `${strategyConfig.patternBrainEnabled ? 1 : 0}${strategyConfig.momentumTrendEnabled ? 1 : 0}${strategyConfig.dragonContrarianEnabled ? 1 : 0}`;

  const [useGeminiAi, setUseGeminiAi] = useState(false);
  const useGeminiAiRef = useRef(false);
  useGeminiAiRef.current = useGeminiAi;
  const [aiPredictions, setAiPredictions] = useState<Record<string, WingoPredictionResult>>({});
  const [aiStatus, setAiStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHistory, setAiHistory] = useState<AiPredictionHistoryItem[]>([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
  const aiPredictionsRef = useRef<Record<string, WingoPredictionResult>>({});
  aiPredictionsRef.current = aiPredictions;
  const aiInFlightRef = useRef<Set<string>>(new Set());
  const aiLastAttemptRef = useRef<Map<string, number>>(new Map());

  const predictionCacheRef = useRef<Map<string, WingoPredictionResult>>(new Map());

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const aiUnlocked = useMemo(
    () => isUserAiPassUnlocked(user, nowTick),
    [user, nowTick]
  );
  const aiUnlockedRef = useRef(aiUnlocked);
  aiUnlockedRef.current = aiUnlocked;

  useEffect(() => {
    if (!aiUnlocked && useGeminiAi) {
      useGeminiAiRef.current = false;
      setUseGeminiAi(false);
      setAiStatus('idle');
      setAiError('AI PASS expired or inactive. Activate AI PASS to resume Gemini AI predictions.');
      setAiHistory([]);
    }
  }, [aiUnlocked, useGeminiAi]);

  const loadAiHistory = useCallback(async () => {
    if (!user || !aiUnlockedRef.current) {
      setAiHistory([]);
      return;
    }
    setAiHistoryLoading(true);
    try {
      const res = await fetchAiPredictionHistory({
        interval: wingoIntervalRef.current,
        gameSlug: game.slug,
        limit: 30,
      });
      setAiHistory(Array.isArray(res?.history) ? res.history : []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.data?.aiPassRequired) {
        useGeminiAiRef.current = false;
        setUseGeminiAi(false);
        setAiHistory([]);
      }
    } finally {
      setAiHistoryLoading(false);
    }
  }, [user, game.slug]);

  const getStablePrediction = useCallback(
    (pid: string, intervalOverride?: WingoInterval): WingoPredictionResult => {
      const activeInterval = intervalOverride || wingoIntervalRef.current;
      const aiKey = `${activeInterval}:${pid}`;
      if (useGeminiAiRef.current && aiUnlockedRef.current) {
        const aiPred = aiPredictionsRef.current[aiKey];
        if (
          aiPred &&
          (aiPred.label === 'BIG' ||
            aiPred.label === 'SMALL' ||
            aiPred.label === 'SKIP' ||
            aiPred.label === 'INSUFFICIENT_DATA')
        ) {
          return aiPred;
        }
      }
      const intervalResults = resultsByIntervalRef.current[activeInterval] || [];
      const latestIssueTag = intervalResults[0]?.issueNumber || 'none';
      const cacheKey = `${pid}:${activeInterval}:${game.slug}:${clockMode || 'auto'}:${predictorMode}:${stratKey}:${latestIssueTag}`;
      const cached = predictionCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const computed = getPredictionForPeriod(
        pid,
        game.slug,
        clockMode,
        intervalResults,
        predictorMode,
        activeInterval,
        strategyConfig
      );
      predictionCacheRef.current.set(cacheKey, computed);
      if (predictionCacheRef.current.size > 60) {
        const firstKey = predictionCacheRef.current.keys().next().value;
        if (firstKey) predictionCacheRef.current.delete(firstKey);
      }
      return computed;
    },
    [game.slug, clockMode, predictorMode, stratKey, strategyConfig]
  );

  const [clock, setClock] = useState<WingoClock>(() =>
    getWingoClock(game.slug, wingoInterval, 0, game.modMenuConfig?.clockMode)
  );
  const [revealState, setRevealState] = useState<{
    mode: 'prediction' | 'win' | 'loss' | 'stop' | 'scanning';
    text: string;
    statusText: string;
    visible: boolean;
  }>(() => {
    const initInterval = wingoInterval;
    const initClock = getWingoClock(game.slug, initInterval, 0, game.modMenuConfig?.clockMode);
    const initResults = initInterval === '1m' ? recentWingoResults || [] : [];
    const initStrat = normalizeStrategyConfig(
      platformConfig?.strategyConfig,
      platformConfig?.predictorMode || 'pattern-ai'
    );
    const pred = getPredictionForPeriod(
      initClock.periodId,
      game.slug,
      game.modMenuConfig?.clockMode,
      initResults,
      platformConfig?.predictorMode || 'pattern-ai',
      initInterval,
      initStrat
    );
    return {
      mode: 'prediction',
      text: pred?.label || 'INSUFFICIENT_DATA',
      statusText:
        pred?.label === 'INSUFFICIENT_DATA'
          ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${initClock.periodId.slice(-4)})`
          : `WINGO ${initInterval.toUpperCase()} · PERIOD ${initClock.periodId.slice(-4)}`,
      visible: true,
    };
  });

  const revealTimerRef = useRef<number | null>(null);
  const lastPeriodRef = useRef<string>(`${wingoInterval}:${clock.periodId}`);
  const clockRef = useRef<WingoClock>(clock);
  const liveApiWindowRef = useRef<{
    interval: WingoInterval;
    issueNumber: string;
    endMs: number;
  } | null>(null);
  const syncingIssueRef = useRef(false);
  const autoLaunchedRef = useRef(false);

  clockRef.current = clock;

  const triggerAiPrediction = useCallback(
    async (targetPeriodId: string, force = false, intervalOverride?: WingoInterval) => {
      const targetInterval = intervalOverride || wingoIntervalRef.current;
      const aiKey = `${targetInterval}:${targetPeriodId}`;
      if (!user || !aiUnlockedRef.current || (!useGeminiAiRef.current && !force)) {
        if (!aiUnlockedRef.current && useGeminiAiRef.current) {
          useGeminiAiRef.current = false;
          setUseGeminiAi(false);
        }
        if (!useGeminiAiRef.current) {
          setAiStatus('idle');
          setAiError(null);
        }
        return;
      }
      if (!force && (aiPredictionsRef.current[aiKey] || aiInFlightRef.current.has(aiKey))) {
        return;
      }
      aiLastAttemptRef.current.set(aiKey, Date.now());
      aiInFlightRef.current.add(aiKey);
      setAiStatus('analyzing');
      setAiError(null);
      try {
        const res = await requestAiWingoPrediction({
          periodId: targetPeriodId,
          gameSlug: game.slug,
          gameName: game.name,
          interval: targetInterval,
          clockMode,
          clientResults: resultsByIntervalRef.current[targetInterval] || [],
        });
        const aiPred = res?.prediction;
        if (
          !aiPred ||
          (aiPred.label !== 'BIG' && aiPred.label !== 'SMALL' && aiPred.label !== 'SKIP')
        ) {
          throw new Error('AI prediction returned an incomplete payload.');
        }
        if (Array.isArray(res.recentResults) && res.recentResults.length > 0) {
          setResultsByInterval((prev) => ({
            ...prev,
            [targetInterval]: res.recentResults,
          }));
        }
        setAiPredictions((prev) => ({
          ...prev,
          [aiKey]: aiPred,
        }));
        setAiStatus('ready');
        void loadAiHistory();
        if (
          clockRef.current.periodId === targetPeriodId &&
          wingoIntervalRef.current === targetInterval &&
          useGeminiAiRef.current
        ) {
          setRevealState((prev) =>
            prev.mode === 'prediction' || prev.mode === 'scanning'
              ? {
                  mode: 'prediction',
                  text: aiPred.label,
                  statusText:
                    aiPred.label === 'SKIP'
                      ? `AI SKIP GUARD · WAIT (${targetInterval.toUpperCase()} #${targetPeriodId.slice(-4)})`
                      : aiPred.allWalletSureshot
                      ? `AI SURESHOT LOCK · ${targetInterval.toUpperCase()} #${targetPeriodId.slice(-4)}`
                      : `GEMINI AI (${targetInterval.toUpperCase()}) · PERIOD ${targetPeriodId.slice(-4)}`,
                  visible: true,
                }
              : prev
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && err.data?.aiPassRequired) {
          useGeminiAiRef.current = false;
          setUseGeminiAi(false);
          setAiStatus('idle');
          setAiError(err.message);
          const fallbackPred = getStablePrediction(targetPeriodId, targetInterval);
          if (
            clockRef.current.periodId === targetPeriodId &&
            wingoIntervalRef.current === targetInterval
          ) {
            setRevealState({
              mode: 'prediction',
              text: fallbackPred.label,
              statusText:
                fallbackPred.label === 'INSUFFICIENT_DATA'
                  ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${targetPeriodId.slice(-4)})`
                  : `WINGO ${targetInterval.toUpperCase()} · PERIOD ${targetPeriodId.slice(-4)}`,
              visible: true,
            });
          }
          apiRequest<{ user: UserProfile }>('/api/auth/me')
            .then((me) => {
              if (me?.user) onUserUpdated(me.user);
            })
            .catch(() => {
              // ignore
            });
          return;
        }
        const errMessage = err instanceof Error ? err.message : 'AI prediction unavailable.';
        const isDataProblem = Boolean(err instanceof ApiError && err.data?.dataProblem);
        setAiStatus('error');
        setAiError(errMessage);
        if (
          clockRef.current.periodId === targetPeriodId &&
          wingoIntervalRef.current === targetInterval &&
          useGeminiAiRef.current
        ) {
          const fallbackPred = getStablePrediction(targetPeriodId, targetInterval);
          setRevealState({
            mode: 'prediction',
            text: isDataProblem ? 'INSUFFICIENT_DATA' : fallbackPred.label,
            statusText: isDataProblem
              ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${targetPeriodId.slice(-4)})`
              : `AI NOTICE · TAP RE-ANALYZE (#${targetPeriodId.slice(-4)})`,
            visible: true,
          });
        }
      } finally {
        aiInFlightRef.current.delete(aiKey);
      }
    },
    [user, game.slug, game.name, clockMode, loadAiHistory, onUserUpdated, getStablePrediction]
  );

  const handleToggleGeminiAi = () => {
    if (!aiUnlocked) {
      setUnlockPlanId('weekly');
      setUnlockModalFeature('ai');
      return;
    }
    const next = !useGeminiAi;
    useGeminiAiRef.current = next;
    setUseGeminiAi(next);
    const pid = clockRef.current.periodId;
    const activeInterval = wingoIntervalRef.current;
    const aiKey = `${activeInterval}:${pid}`;
    if (next) {
      void loadAiHistory();
      const existingAi = aiPredictionsRef.current[aiKey];
      if (
        existingAi &&
        (existingAi.label === 'BIG' || existingAi.label === 'SMALL' || existingAi.label === 'SKIP')
      ) {
        setAiStatus('ready');
        setRevealState({
          mode: 'prediction',
          text: existingAi.label,
          statusText:
            existingAi.label === 'SKIP'
              ? `AI SKIP GUARD · WAIT (${activeInterval.toUpperCase()} #${pid.slice(-4)})`
              : existingAi.allWalletSureshot
              ? `AI SURESHOT LOCK · ${activeInterval.toUpperCase()} #${pid.slice(-4)}`
              : `GEMINI AI (${activeInterval.toUpperCase()}) · PERIOD ${pid.slice(-4)}`,
          visible: true,
        });
      } else {
        setRevealState({
          mode: 'scanning',
          text: 'AI',
          statusText: `ACTIVATING GEMINI AI (${activeInterval.toUpperCase()})...`,
          visible: false,
        });
      }
      void triggerAiPrediction(pid, true, activeInterval);
    } else {
      setAiStatus('idle');
      setAiError(null);
      const normalPred = getPredictionForPeriod(
        pid,
        game.slug,
        clockMode,
        resultsByIntervalRef.current[activeInterval] || [],
        predictorMode,
        activeInterval,
        strategyConfig
      );
      setRevealState({
        mode: 'prediction',
        text: normalPred.label,
        statusText:
          normalPred.label === 'INSUFFICIENT_DATA'
            ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${pid.slice(-4)})`
            : `WINGO ${activeInterval.toUpperCase()} · PERIOD ${pid.slice(-4)}`,
        visible: true,
      });
    }
  };

  const handleSwitchWingoInterval = (nextInterval: WingoInterval) => {
    if (nextInterval === wingoIntervalRef.current) return;
    try {
      window.localStorage.setItem('kwg_wingo_interval', nextInterval);
    } catch {
      // ignore storage errors
    }
    wingoIntervalRef.current = nextInterval;
    liveApiWindowRef.current = null;
    setWingoInterval(nextInterval);
    const nextClk = getWingoClock(game.slug, nextInterval, 0, clockMode);
    setClock(nextClk);
    clockRef.current = nextClk;
    lastPeriodRef.current = `${nextInterval}:${nextClk.periodId}`;
    const hasCachedDraws = (resultsByIntervalRef.current[nextInterval] || []).length >= 6;
    if (!hasCachedDraws) {
      setRevealState({
        mode: 'scanning',
        text: 'SCAN',
        statusText: `SYNCING ${nextInterval.toUpperCase()} LIVE RESULTS...`,
        visible: false,
      });
    } else if (useGeminiAiRef.current && aiUnlockedRef.current) {
      const existingAi = aiPredictionsRef.current[`${nextInterval}:${nextClk.periodId}`];
      if (
        existingAi &&
        (existingAi.label === 'BIG' || existingAi.label === 'SMALL' || existingAi.label === 'SKIP')
      ) {
        setRevealState({
          mode: 'prediction',
          text: existingAi.label,
          statusText:
            existingAi.label === 'SKIP'
              ? `AI SKIP GUARD · WAIT (${nextInterval.toUpperCase()} #${nextClk.periodId.slice(-4)})`
              : existingAi.allWalletSureshot
              ? `AI SURESHOT LOCK · ${nextInterval.toUpperCase()} #${nextClk.periodId.slice(-4)}`
              : `GEMINI AI (${nextInterval.toUpperCase()}) · PERIOD ${nextClk.periodId.slice(-4)}`,
          visible: true,
        });
      } else {
        setRevealState({
          mode: 'scanning',
          text: 'AI',
          statusText: `ANALYZING ${nextInterval.toUpperCase()} VIA GEMINI AI...`,
          visible: false,
        });
      }
    } else {
      const pred = getStablePrediction(nextClk.periodId, nextInterval);
      setRevealState({
        mode: 'prediction',
        text: pred.label,
        statusText:
          pred.label === 'INSUFFICIENT_DATA'
            ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${nextClk.periodId.slice(-4)})`
            : `WINGO ${nextInterval.toUpperCase()} · PERIOD ${nextClk.periodId.slice(-4)}`,
        visible: true,
      });
    }
    if (aiUnlockedRef.current) {
      void loadAiHistory();
    }
  };

  const levelBets = useMemo(() => {
    const parsed = parseFloat(depositInput);
    const amt = sessionActive ? baseDeposit : Number.isNaN(parsed) || parsed < 10 ? 100 : parsed;
    return computeLevelSplit(amt, maxLevels, splitMode);
  }, [depositInput, baseDeposit, maxLevels, splitMode, sessionActive]);

  const currentSignal = useMemo(() => {
    const aiKey = `${wingoInterval}:${clock.periodId}`;
    const aiPred = useGeminiAi && aiUnlocked ? aiPredictions[aiKey] : undefined;
    return aiPred &&
      (aiPred.label === 'BIG' || aiPred.label === 'SMALL' || aiPred.label === 'SKIP')
      ? aiPred
      : getStablePrediction(clock.periodId, wingoInterval);
  }, [aiPredictions, clock.periodId, wingoInterval, getStablePrediction, useGeminiAi, aiUnlocked, localRecentResults]);
  const settledPeriodId = useMemo(
    () => getPreviousPeriodId(clock.periodId, game.slug, clockMode, wingoInterval),
    [clock.periodId, game.slug, clockMode, wingoInterval]
  );
  const settledSignal = useMemo(() => {
    const aiKey = `${wingoInterval}:${settledPeriodId}`;
    const aiPred = useGeminiAi && aiUnlocked ? aiPredictions[aiKey] : undefined;
    return aiPred &&
      (aiPred.label === 'BIG' || aiPred.label === 'SMALL' || aiPred.label === 'SKIP')
      ? aiPred
      : getStablePrediction(settledPeriodId, wingoInterval);
  }, [aiPredictions, settledPeriodId, wingoInterval, getStablePrediction, useGeminiAi, aiUnlocked, localRecentResults]);

  const historyStats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let netPnl = 0;
    for (const item of roundHistory) {
      if (item.outcome === 'WIN') wins += 1;
      else losses += 1;
      netPnl += item.pnlDelta;
    }
    const total = roundHistory.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { total, wins, losses, winRate, netPnl: Math.round(netPnl * 100) / 100 };
  }, [roundHistory]);

  const needsPayment =
    game.pricing_type === 'paid' &&
    game.price > 0 &&
    !(game.billing_mode === 'once' && game.isUnlocked);

  const launchGame = useCallback(async () => {
    setError(null);
    setInsufficientFunds(false);
    setLoading(true);

    try {
      const res = await apiRequest<{
        srcDoc: string;
        embedUrl?: string | null;
        game?: { modMenuConfig?: ModMenuConfig };
        user: UserProfile;
        chargedAmount: number;
      }>(`/api/games/${game.id}/access`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onUserUpdated(res.user);
      onGameUnlocked();
      if (res.game?.modMenuConfig) {
        setActiveModConfig(res.game.modMenuConfig);
      }
      setIframeReady(false);
      setEmbedUrl(res.embedUrl || null);
      setSrcDoc(res.srcDoc || '<html><body style="background:#050508;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">Arena Ready</body></html>');
    } catch (err) {
      autoLaunchedRef.current = false;
      if (err instanceof ApiError && err.data?.insufficientFunds) {
        setInsufficientFunds(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to open game.');
    } finally {
      setLoading(false);
    }
  }, [game.id, onGameUnlocked, onUserUpdated]);

  useEffect(() => {
    if (!embedUrl) return undefined;
    setIframeReady(false);
    const safetyTimer = window.setTimeout(() => setIframeReady(true), 2600);
    return () => window.clearTimeout(safetyTimer);
  }, [embedUrl, frameKey]);

  useEffect(() => {
    if (user && !needsPayment && srcDoc === null && !autoLaunchedRef.current) {
      autoLaunchedRef.current = true;
      launchGame();
    }
  }, [user, needsPayment, srcDoc, launchGame]);

  useEffect(() => {
    if (srcDoc === null || !user) return;
    let active = true;
    apiRequest<{ records: ModMenuRoundRecord[] }>(
      `/api/mod-history?gameSlug=${encodeURIComponent(game.slug)}&entryType=manual`
    )
      .then((res) => {
        if (!active) return;
        setRoundHistory(
          res.records.map((r) => ({
            id: String(r.id),
            periodId: r.period_id,
            signal: r.signal,
            level: r.level,
            maxLevels: r.max_levels,
            betAmount: r.bet_amount,
            outcome: r.outcome,
            pnlDelta: r.pnl_delta,
            recordedAt: new Date(r.created_at).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          }))
        );
      })
      .catch(() => {
        // ignore history fetch failures
      });
    return () => {
      active = false;
    };
  }, [srcDoc, user?.id, game.slug]);

  useEffect(() => {
    if (srcDoc === null && embedUrl === null) return undefined;

    const isPartner = isPartnerWingoGame;
    const activeInterval = wingoInterval;
    const maxSec = activeInterval === '30s' ? 30 : 60;
    let mounted = true;
    let pollTickCounter = 0;

    const syncRevealForCurrentMode = (pid: string) => {
      if (!mounted || wingoIntervalRef.current !== activeInterval) return;
      if (useGeminiAiRef.current && aiUnlockedRef.current) {
        const aiPred = aiPredictionsRef.current[`${activeInterval}:${pid}`];
        if (
          aiPred &&
          (aiPred.label === 'BIG' || aiPred.label === 'SMALL' || aiPred.label === 'SKIP')
        ) {
          setRevealState((prev) =>
            prev.mode === 'prediction' || prev.mode === 'scanning'
              ? {
                  mode: 'prediction',
                  text: aiPred.label,
                  statusText:
                    aiPred.label === 'SKIP'
                      ? `AI SKIP GUARD · WAIT (${activeInterval.toUpperCase()} #${pid.slice(-4)})`
                      : aiPred.allWalletSureshot
                      ? `AI SURESHOT LOCK · ${activeInterval.toUpperCase()} #${pid.slice(-4)}`
                      : `GEMINI AI (${activeInterval.toUpperCase()}) · PERIOD ${pid.slice(-4)}`,
                  visible: true,
                }
              : prev
          );
        }
        return;
      }

      const normalPred = getStablePrediction(pid, activeInterval);
      setRevealState((prev) =>
        prev.mode === 'prediction' || prev.mode === 'scanning'
          ? {
              mode: 'prediction',
              text: normalPred.label,
              statusText:
                normalPred.label === 'INSUFFICIENT_DATA'
                  ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${pid.slice(-4)})`
                  : normalPred.allWalletSureshot
                  ? `AI SURESHOT LOCK · ${activeInterval.toUpperCase()} #${pid.slice(-4)}`
                  : `WINGO ${activeInterval.toUpperCase()} · PERIOD ${pid.slice(-4)}`,
              visible: true,
            }
          : prev
      );
    };

    let settleFollowUpTimer: number | null = null;
    let revealSyncTimer: number | null = null;

    const refreshResultsForBrain = async (targetPeriodId?: string) => {
      try {
        const latest = await fetchPartnerWingoResults(30, activeInterval);
        if (mounted && latest.length > 0) {
          setResultsByInterval((prev) => ({
            ...prev,
            [activeInterval]: latest,
          }));
          resultsByIntervalRef.current = {
            ...resultsByIntervalRef.current,
            [activeInterval]: latest,
          };
        }
      } catch {
        // ignore transient errors
      }
      if (mounted) {
        const currentPid = targetPeriodId || clockRef.current.periodId;
        if (useGeminiAiRef.current && aiUnlockedRef.current) {
          void triggerAiPrediction(currentPid, false, activeInterval);
          void loadAiHistory();
        } else {
          syncRevealForCurrentMode(currentPid);
          if (aiUnlockedRef.current) {
            void loadAiHistory();
          }
        }
      }
    };

    void refreshResultsForBrain(clockRef.current.periodId);

    // Quietly prefetch the alternate interval (e.g. 30s when in 1m) so switching modes is immediate
    const altInterval: WingoInterval = activeInterval === '30s' ? '1m' : '30s';
    if ((resultsByIntervalRef.current[altInterval] || []).length === 0) {
      void fetchPartnerWingoResults(30, altInterval)
        .then((altLatest) => {
          if (mounted && altLatest.length > 0) {
            setResultsByInterval((prev) => ({
              ...prev,
              [altInterval]: altLatest,
            }));
            resultsByIntervalRef.current = {
              ...resultsByIntervalRef.current,
              [altInterval]: altLatest,
            };
          }
        })
        .catch(() => undefined);
    }

    const applyNewPeriod = (nextClock: WingoClock) => {
      setClock(nextClock);
      const periodKey = `${activeInterval}:${nextClock.periodId}`;
      if (periodKey !== lastPeriodRef.current) {
        lastPeriodRef.current = periodKey;
        void refreshResultsForBrain(nextClock.periodId);
        if (settleFollowUpTimer !== null) window.clearTimeout(settleFollowUpTimer);
        settleFollowUpTimer = window.setTimeout(() => {
          if (mounted && wingoIntervalRef.current === activeInterval) {
            void refreshResultsForBrain(nextClock.periodId);
          }
        }, 3200);
        setRevealState({
          mode: 'scanning',
          text: useGeminiAiRef.current && aiUnlockedRef.current ? 'AI' : 'SCAN',
          statusText:
            useGeminiAiRef.current && aiUnlockedRef.current
              ? `GEMINI AI ANALYZING ${activeInterval.toUpperCase()}...`
              : `READING ${activeInterval.toUpperCase()} LIVE RESULTS...`,
          visible: false,
        });
        if (revealSyncTimer !== null) window.clearTimeout(revealSyncTimer);
        revealSyncTimer = window.setTimeout(() => {
          syncRevealForCurrentMode(nextClock.periodId);
        }, 500);
      }
    };

    const syncPartner = async () => {
      if (!isPartner || syncingIssueRef.current) return;
      syncingIssueRef.current = true;
      try {
        const res = await fetchPartnerWingoIssue(activeInterval);
        if (mounted && res?.issueNumber && wingoIntervalRef.current === activeInterval) {
          liveApiWindowRef.current = {
            interval: activeInterval,
            issueNumber: res.issueNumber,
            endMs: Date.now() + res.secLeft * 1000,
          };
          applyNewPeriod({ periodId: res.issueNumber, secLeft: res.secLeft });
        }
      } finally {
        syncingIssueRef.current = false;
      }
    };

    if (isPartner) {
      void syncPartner();
    }

    const ensureAiForActivePeriod = (activeClock: WingoClock) => {
      if (!useGeminiAiRef.current || !aiUnlockedRef.current || activeClock.secLeft < 3) return;
      const aiKey = `${activeInterval}:${activeClock.periodId}`;
      if (aiPredictionsRef.current[aiKey] || aiInFlightRef.current.has(aiKey)) return;
      const lastTried = aiLastAttemptRef.current.get(aiKey) || 0;
      if (Date.now() - lastTried < 5000) return;
      if ((resultsByIntervalRef.current[activeInterval] || []).length >= 6) {
        void triggerAiPrediction(activeClock.periodId, false, activeInterval);
      } else {
        aiLastAttemptRef.current.set(aiKey, Date.now());
        void refreshResultsForBrain(activeClock.periodId);
      }
    };

    const tick = () => {
      if (
        isPartner &&
        liveApiWindowRef.current &&
        liveApiWindowRef.current.interval === activeInterval
      ) {
        const remaining = Math.ceil((liveApiWindowRef.current.endMs - Date.now()) / 1000);
        pollTickCounter += 1;
        if (remaining <= 0 || pollTickCounter % 12 === 0) {
          void syncPartner();
        }
        if (remaining > 0) {
          const clk = {
            periodId: liveApiWindowRef.current.issueNumber,
            secLeft: Math.min(maxSec, remaining),
          };
          applyNewPeriod(clk);
          ensureAiForActivePeriod(clk);
          return;
        }
      }
      const fallbackClk = getWingoClock(game.slug, activeInterval, 0, clockMode);
      applyNewPeriod(fallbackClk);
      ensureAiForActivePeriod(fallbackClk);
    };

    const id = window.setInterval(tick, 1000);
    return () => {
      mounted = false;
      window.clearInterval(id);
      if (settleFollowUpTimer !== null) {
        window.clearTimeout(settleFollowUpTimer);
      }
      if (revealSyncTimer !== null) {
        window.clearTimeout(revealSyncTimer);
      }
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, [srcDoc, embedUrl, game.slug, isPartnerWingoGame, clockMode, wingoInterval, getStablePrediction, triggerAiPrediction, loadAiHistory]);

  const triggerRadarRescan = (delayMs: number) => {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    const activeInterval = wingoIntervalRef.current;
    revealTimerRef.current = window.setTimeout(async () => {
      setRevealState({
        mode: 'scanning',
        text: 'SYNC',
        statusText: `SYNCING ${activeInterval.toUpperCase()} LIVE DRAWS...`,
        visible: false,
      });
      try {
        const latest = await fetchPartnerWingoResults(30, activeInterval);
        if (latest.length > 0) {
          setResultsByInterval((prev) => ({
            ...prev,
            [activeInterval]: latest,
          }));
          resultsByIntervalRef.current = {
            ...resultsByIntervalRef.current,
            [activeInterval]: latest,
          };
        }
      } catch {
        // ignore transient fetch errors
      }
      const latestPeriodId = clockRef.current.periodId;
      if (useGeminiAiRef.current && aiUnlockedRef.current) {
        void triggerAiPrediction(latestPeriodId, true, activeInterval);
        return;
      }
      const sig = getStablePrediction(latestPeriodId, activeInterval);
      setRevealState({
        mode: 'prediction',
        text: sig.label,
        statusText:
          sig.label === 'INSUFFICIENT_DATA'
            ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${latestPeriodId.slice(-4)})`
            : sig.allWalletSureshot
            ? `AI SURESHOT LOCK · ${activeInterval.toUpperCase()} #${latestPeriodId.slice(-4)}`
            : `WINGO ${activeInterval.toUpperCase()} · PERIOD ${latestPeriodId.slice(-4)}`,
        visible: true,
      });
    }, delayMs);
  };

  const handleStartEngine = () => {
    const val = parseFloat(depositInput);
    if (Number.isNaN(val) || val < 10) {
      return;
    }
    const rounded = Math.round(val);
    setBaseDeposit(rounded);
    setTotalLoss(0);
    setCurrentLevel(1);
    setSessionActive(true);

    const activeInterval = wingoIntervalRef.current;
    const latestPeriodId = clockRef.current.periodId;
    setRevealState({
      mode: 'scanning',
      text: 'SCAN',
      statusText: `ANALYZING ${activeInterval.toUpperCase()} LIVE RESULTS...`,
      visible: false,
    });
    if (useGeminiAiRef.current && aiUnlockedRef.current) {
      void triggerAiPrediction(latestPeriodId, true, activeInterval);
      return;
    }
    window.setTimeout(() => {
      const sig = getStablePrediction(latestPeriodId, activeInterval);
      setRevealState({
        mode: 'prediction',
        text: sig.label,
        statusText:
          sig.label === 'INSUFFICIENT_DATA'
            ? `DATA CHECK · NEED 6 VERIFIED DRAWS (#${latestPeriodId.slice(-4)})`
            : sig.allWalletSureshot
            ? `AI SURESHOT LOCK · ${activeInterval.toUpperCase()} #${latestPeriodId.slice(-4)}`
            : `WINGO ${activeInterval.toUpperCase()} · PERIOD ${latestPeriodId.slice(-4)}`,
        visible: true,
      });
    }, 500);
  };

  const formatTimeOnly = () =>
    new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const persistRound = async (item: RoundHistoryItem) => {
    try {
      await apiRequest('/api/mod-history', {
        method: 'POST',
        body: JSON.stringify({
          gameSlug: game.slug,
          gameName: game.name,
          periodId: item.periodId,
          signal: item.signal,
          level: item.level,
          maxLevels: item.maxLevels,
          betAmount: item.betAmount,
          outcome: item.outcome,
          pnlDelta: item.pnlDelta,
        }),
      });
    } catch {
      // keep optimistic entry visible
    }
  };

  const handleWinClick = () => {
    if (!sessionActive) return;
    const activeInterval = wingoIntervalRef.current;
    const prevPeriodId = getPreviousPeriodId(
      clockRef.current.periodId,
      game.slug,
      clockMode,
      activeInterval
    );
    const prevSignal = getStablePrediction(prevPeriodId, activeInterval);
    const resolvedDir: 'BIG' | 'SMALL' =
      prevSignal.label === 'INSUFFICIENT_DATA' || prevSignal.label === 'SKIP'
        ? getPredictionForPeriod(
            prevPeriodId,
            game.slug,
            clockMode,
            resultsByIntervalRef.current[activeInterval] || [],
            predictorMode,
            activeInterval,
            strategyConfig
          ).label === 'SMALL'
          ? 'SMALL'
          : 'BIG'
        : prevSignal.label;
    const activeBet = levelBets[currentLevel - 1] || levelBets[0] || 0;
    const profit = Math.round(activeBet * 0.96 * 100) / 100;

    const entry: RoundHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      periodId: prevPeriodId,
      signal: resolvedDir,
      level: currentLevel,
      maxLevels,
      betAmount: activeBet,
      outcome: 'WIN',
      pnlDelta: profit,
      recordedAt: formatTimeOnly(),
    };

    setRoundHistory((prev) => [entry, ...prev]);
    void persistRound(entry);

    setTotalLoss(0);
    setCurrentLevel(1);
    setRevealState({
      mode: 'win',
      text: 'WIN',
      statusText: `WIN RECORDED (${prevPeriodId.slice(-4)}) · LEVEL 1 RESET`,
      visible: true,
    });
    triggerRadarRescan(1800);
  };

  const handleLossClick = () => {
    if (!sessionActive) return;
    const activeInterval = wingoIntervalRef.current;
    const prevPeriodId = getPreviousPeriodId(
      clockRef.current.periodId,
      game.slug,
      clockMode,
      activeInterval
    );
    const prevSignal = getStablePrediction(prevPeriodId, activeInterval);
    const resolvedDir: 'BIG' | 'SMALL' =
      prevSignal.label === 'INSUFFICIENT_DATA' || prevSignal.label === 'SKIP'
        ? getPredictionForPeriod(
            prevPeriodId,
            game.slug,
            clockMode,
            resultsByIntervalRef.current[activeInterval] || [],
            predictorMode,
            activeInterval,
            strategyConfig
          ).label === 'SMALL'
          ? 'SMALL'
          : 'BIG'
        : prevSignal.label;
    const activeBet = levelBets[currentLevel - 1] || 0;
    const hitLimit = currentLevel >= maxLevels || totalLoss + activeBet > baseDeposit;

    const entry: RoundHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      periodId: prevPeriodId,
      signal: resolvedDir,
      level: currentLevel,
      maxLevels,
      betAmount: activeBet,
      outcome: hitLimit ? 'STOP' : 'LOSS',
      pnlDelta: -activeBet,
      recordedAt: formatTimeOnly(),
    };

    setRoundHistory((prev) => [entry, ...prev]);
    void persistRound(entry);

    if (hitLimit) {
      setTotalLoss((prev) => Math.min(baseDeposit, prev + activeBet));
      setRevealState({
        mode: 'stop',
        text: 'STOP',
        statusText: `MAX LEVEL / LIMIT (${prevPeriodId.slice(-4)})`,
        visible: true,
      });
      triggerRadarRescan(2200);
      return;
    }

    const nextLvl = currentLevel + 1;
    setTotalLoss((prev) => prev + activeBet);
    setCurrentLevel(nextLvl);
    setRevealState({
      mode: 'loss',
      text: 'LOSS',
      statusText: `LOSS RECORDED (${prevPeriodId.slice(-4)}) · LEVEL ${nextLvl} READY`,
      visible: true,
    });
    triggerRadarRescan(1800);
  };

  const handleClearModHistory = async () => {
    setRoundHistory([]);
    try {
      await apiRequest(
        `/api/mod-history?gameSlug=${encodeURIComponent(game.slug)}&entryType=manual`,
        {
          method: 'DELETE',
        }
      );
    } catch {
      // ignore
    }
  };

  const handleResetSession = () => {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    setSessionActive(false);
    setTotalLoss(0);
    setCurrentLevel(1);
    const activeInterval = wingoIntervalRef.current;
    const sig = getStablePrediction(clock.periodId, activeInterval);
    setRevealState({
      mode: 'prediction',
      text: sig.label,
      statusText: `WINGO ${activeInterval.toUpperCase()} · PERIOD ${clock.periodId.slice(-4)}`,
      visible: true,
    });
  };

  const isKwgEmbedMode = Boolean(embedUrl);

  if (srcDoc !== null) {
    const currentWallet = Math.max(0, baseDeposit - totalLoss);
    const currentBet = levelBets[currentLevel - 1] || levelBets[0] || 0;
    const nextLevelBet = currentLevel < maxLevels ? levelBets[currentLevel] : levelBets[0];
    const timerFormatted = `00:${clock.secLeft < 10 ? `0${clock.secLeft}` : clock.secLeft}`;

    const resultColor =
      revealState.mode === 'win'
        ? '#00ff88'
        : revealState.mode === 'loss' || revealState.mode === 'stop'
        ? '#ff3c78'
        : revealState.text === 'INSUFFICIENT_DATA' || revealState.text === 'SKIP'
        ? '#fbbf24'
        : revealState.text === 'BIG'
        ? '#00ff88'
        : '#00f2ff';

    const safeAiHistory = Array.isArray(aiHistory) ? aiHistory : [];
    const settledAiRows = safeAiHistory.filter((h) => h.outcome === 'WIN' || h.outcome === 'LOSS');
    const aiHistoryWins = settledAiRows.filter((h) => h.outcome === 'WIN').length;
    const aiHistoryRate =
      settledAiRows.length > 0 ? Math.round((aiHistoryWins / settledAiRows.length) * 100) : 0;

    return (
      <div className="fixed inset-0 z-50 bg-[#050508] flex flex-col">
        {/* Top Full-Screen Switcher Header */}
        <header className="h-14 px-3 sm:px-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 sm:gap-4 shrink-0">
          <div className="min-w-0 hidden md:block">
            <div className="text-sm font-bold text-white truncate">{game.title}</div>
            <div className="text-xs text-slate-400 truncate flex items-center gap-1.5">
              <span>{game.name}</span>
              <span>·</span>
              {user ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-slate-200 font-semibold">{user.username}</span>
                  <AiPassBadge active={aiUnlocked} size="xs" />
                </span>
              ) : (
                <span>Active Session</span>
              )}
            </div>
          </div>

          {/* Game / Menu Full-Screen View Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActivePane('game')}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                activePane === 'game' || !menuEnabled
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Game</span>
            </button>

            {menuEnabled && (
              <button
                type="button"
                onClick={() => setActivePane('menu')}
                style={activePane === 'menu' ? { background: theme.tabGradient } : undefined}
                className={`min-h-[38px] px-3.5 sm:px-4 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                  activePane === 'menu'
                    ? `${theme.tabTextClass} shadow-sm`
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Menu</span>
                <span
                  className={`font-orbitron text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
                    currentSignal.label === 'INSUFFICIENT_DATA' || currentSignal.label === 'SKIP'
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                      : activePane === 'menu'
                      ? 'bg-black/25 text-current'
                      : 'bg-slate-800 text-slate-100'
                  }`}
                  style={
                    activePane !== 'menu' &&
                    currentSignal.label !== 'INSUFFICIENT_DATA' &&
                    currentSignal.label !== 'SKIP'
                      ? { color: theme.accent }
                      : undefined
                  }
                >
                  {wingoInterval.toUpperCase()} · {timerFormatted} ·{' '}
                  {currentSignal.label === 'INSUFFICIENT_DATA' ? 'SYNCING' : currentSignal.label}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isKwgEmbedMode && embedUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setFrameKey((k) => k + 1)}
                  className="min-h-[38px] px-2.5 sm:px-3 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  title="Reload game embed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Reload</span>
                </button>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-2.5 sm:px-3 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
                  title="Open game in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Direct Link</span>
                </a>
              </>
            )}
          </div>
        </header>

        {/* Full-Screen Dual Workspace: Side 1 (Game) & Side 2 (Menu) */}
        <div className="relative flex-1 overflow-hidden bg-[#050508]">
          {/* Side 1: Full-Screen Game Frame (Always mounted so session never reloads) */}
          <div
            className={`absolute inset-0 w-full h-full transition-opacity duration-150 bg-[#050508] ${
              activePane === 'game' || !menuEnabled
                ? 'opacity-100 pointer-events-auto z-10'
                : 'opacity-0 pointer-events-none invisible z-0'
            }`}
          >
            {isKwgEmbedMode && embedUrl && !iframeReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050508] text-slate-200 pointer-events-none">
                <div className="w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
                <div className="text-xs font-bold tracking-wide">Connecting to {game.name}...</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  If the site blocks inline embeds, tap Direct Link above.
                </div>
              </div>
            )}
            {isKwgEmbedMode && embedUrl ? (
              <iframe
                key={frameKey}
                id="gameFrame"
                title={game.title}
                src={embedUrl}
                onLoad={() => setIframeReady(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
                allow="fullscreen; clipboard-read; clipboard-write"
                referrerPolicy="no-referrer"
                className="w-full h-full border-0 bg-[#050508]"
              />
            ) : (
              <iframe
                title={game.title}
                srcDoc={srcDoc}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"
                className="w-full h-full border-0 bg-slate-950"
              />
            )}
          </div>

          {/* Side 2: Full-Screen Theme-Styled VIP Menu Command Center */}
          {menuEnabled && activePane === 'menu' && (
            <div
              className="absolute inset-0 z-20 overflow-y-auto text-white"
              style={{ backgroundColor: theme.menuBg }}
            >
              <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-6 space-y-5">
                {/* Scanner Hero Card (with optional multi-color outer gradient frame) */}
                <div
                  className="rounded-2xl p-[1.5px]"
                  style={{
                    background: theme.frameGradient || theme.borderColor,
                    boxShadow: theme.glowShadow,
                  }}
                >
                  <section
                    className="relative overflow-hidden rounded-[15px] p-4 sm:p-6"
                    style={{ backgroundColor: theme.cardBg }}
                  >
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: `linear-gradient(${theme.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${theme.gridColor} 1px, transparent 1px)`,
                        backgroundSize: '18px 18px',
                      }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none animate-radar-scan"
                      style={{
                        background: theme.beamGradient,
                      }}
                    />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-4 mb-5">
                      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                        <span
                          className="font-orbitron text-xs sm:text-sm font-black tracking-wider"
                          style={{
                            color: theme.accent,
                            textShadow: `0 0 14px ${theme.accent}`,
                          }}
                        >
                          ⚡ {theme.label}
                        </span>
                        {user && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded-lg">
                            <span>{user.username}</span>
                            <AiPassBadge active={aiUnlocked} size="xs" />
                          </span>
                        )}
                        {/* Wingo 30S / 1M Mode Selector */}
                        <div className="inline-flex items-center rounded-lg bg-black/60 border border-white/15 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleSwitchWingoInterval('30s')}
                            className={`px-2.5 py-1 rounded-md font-orbitron text-[10px] font-black cursor-pointer transition-all ${
                              wingoInterval === '30s'
                                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            30S
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwitchWingoInterval('1m')}
                            className={`px-2.5 py-1 rounded-md font-orbitron text-[10px] font-black cursor-pointer transition-all ${
                              wingoInterval === '1m'
                                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            1M
                          </button>
                        </div>
                        <span className="font-orbitron text-[11px] bg-white/[0.06] border border-white/10 px-3 py-1 rounded-lg text-slate-300 tabular-nums">
                          PERIOD <strong className="text-[#ffd700] ml-1">{clock.periodId}</strong>
                        </span>
                        <span className="font-orbitron text-[11px] bg-white/[0.06] border border-white/10 px-3 py-1 rounded-lg text-slate-300 tabular-nums">
                          TIMER <strong className="text-[#ffd700] ml-1">{timerFormatted}</strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActivePane('game')}
                        style={{ background: theme.ctaGradient }}
                        className={`min-h-[40px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer self-start md:self-auto ${
                          theme.ctaTextDark ? 'text-slate-950' : 'text-white'
                        }`}
                      >
                        <Gamepad2 className="w-4 h-4" />
                        <span>Go to Game</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center md:text-left">
                      <div className="md:col-span-2 flex flex-col items-center md:items-start">
                        {currentSignal.label === 'INSUFFICIENT_DATA' && revealState.mode === 'prediction' && (
                          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-orbitron text-[10px] font-black text-slate-950 bg-gradient-to-r from-amber-300 to-yellow-400 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>LIVE DATA SYNC REQUIRED · MIN 6 VERIFIED DRAWS</span>
                          </div>
                        )}
                        {currentSignal.label === 'SKIP' && revealState.mode === 'prediction' && (
                          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-orbitron text-[10px] font-black text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 mb-2">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>CONFUSING PATTERN · SKIP &amp; WAIT NEXT ROUND</span>
                          </div>
                        )}
                        {(currentSignal.allWalletSureshot || currentSignal.sureshot) &&
                          currentSignal.label !== 'INSUFFICIENT_DATA' &&
                          currentSignal.label !== 'SKIP' &&
                          revealState.mode === 'prediction' && (
                            <div
                              className="inline-block rounded-full px-3 py-1 font-orbitron text-[10px] font-black text-black mb-2"
                              style={{
                                background: currentSignal.allWalletSureshot
                                  ? 'linear-gradient(90deg, #ffd700, #ff6b00)'
                                  : 'linear-gradient(90deg, #ffd700, #ff8800)',
                              }}
                            >
                              {currentSignal.allWalletSureshot
                                ? '💎 ALL WALLET SURESHOT 💎'
                                : '💎 ULTRA SURESHOT 💎'}
                            </div>
                          )}
                        <div
                          className="text-xs font-medium tracking-wide uppercase"
                          style={{
                            color:
                              currentSignal.label === 'INSUFFICIENT_DATA' ||
                              currentSignal.label === 'SKIP'
                                ? '#fbbf24'
                                : theme.secondaryAccent,
                          }}
                        >
                          {revealState.statusText}
                        </div>
                        <div
                          className={`font-orbitron text-4xl sm:text-6xl font-black tracking-[4px] uppercase leading-tight mt-1 transition-all duration-300 ${
                            revealState.visible ? 'opacity-100 scale-100' : 'opacity-40 scale-75'
                          }`}
                          style={{
                            color: resultColor,
                            textShadow: '0 0 32px currentColor',
                          }}
                        >
                          {revealState.text === 'INSUFFICIENT_DATA' ? 'NO DATA' : revealState.text}
                        </div>
                        {currentSignal.label === 'SKIP' && revealState.mode === 'prediction' && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/40 rounded-lg px-3 py-1.5">
                            <span>
                              Result is confusing or split — AI advises waiting out this round to protect your balance.
                            </span>
                          </div>
                        )}
                        {currentSignal.label === 'INSUFFICIENT_DATA' && revealState.mode === 'prediction' && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/35 rounded-lg px-3 py-1.5">
                            <span>
                              Verified draw history unavailable (&lt; 6 draws). No fake pick generated.
                            </span>
                            <button
                              type="button"
                              onClick={() => triggerRadarRescan(50)}
                              className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                            >
                              Retry Sync
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-1 gap-2.5">
                        <div className="bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-left">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                            {currentSignal.label === 'INSUFFICIENT_DATA'
                              ? 'Data Status'
                              : currentSignal.label === 'SKIP'
                              ? 'Signal Clarity'
                              : 'Signal Confidence'}
                          </div>
                          <div
                            className="font-orbitron text-xl font-black tabular-nums mt-0.5"
                            style={{
                              color:
                                currentSignal.label === 'INSUFFICIENT_DATA' ||
                                currentSignal.label === 'SKIP'
                                  ? '#fbbf24'
                                  : theme.accent,
                            }}
                          >
                            {currentSignal.label === 'INSUFFICIENT_DATA'
                              ? 'SYNCING'
                              : currentSignal.label === 'SKIP'
                              ? 'WAIT · SKIP'
                              : `${currentSignal.prob}%`}
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-left">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                            {currentSignal.label === 'INSUFFICIENT_DATA'
                              ? 'Data Requirement'
                              : currentSignal.label === 'SKIP'
                              ? 'Recommended Bet'
                              : currentSignal.allWalletSureshot
                              ? 'ALL WALLET SURESHOT'
                              : `Active Bet (${sessionActive ? `L${currentLevel}` : 'Preview'})`}
                          </div>
                          <div className="font-orbitron text-xl font-black text-[#ffd700] tabular-nums mt-0.5">
                            {currentSignal.label === 'INSUFFICIENT_DATA'
                              ? 'MIN 6 DRAWS'
                              : currentSignal.label === 'SKIP'
                              ? '₹0 (SKIP)'
                              : currentSignal.allWalletSureshot
                              ? `₹${sessionActive ? currentWallet : currentBet} ALL`
                              : `₹${currentBet}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Smart Pattern Brain Reasoning & Strict AI PASS Access Control */}
                    <div className="relative z-10 mt-5 rounded-xl bg-black/55 border border-white/10 p-3.5 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color:
                                  currentSignal.label === 'INSUFFICIENT_DATA' ||
                                  currentSignal.label === 'SKIP'
                                    ? '#fbbf24'
                                    : theme.accent,
                              }}
                            >
                              {currentSignal.source === 'gemini-ai'
                                ? `Gemini AI Live${currentSignal.selectedStrategy ? ` · ${currentSignal.selectedStrategy}` : ''}`
                                : 'Autonomous Engine'}{' '}
                              · {currentSignal.strategyTag}
                            </span>
                            {currentSignal.combinedAnalysis &&
                              currentSignal.combinedAnalysis.activeCount >= 2 && (
                                <span
                                  className={`font-orbitron text-[10px] font-black px-2 py-0.5 rounded border ${
                                    currentSignal.combinedAnalysis.consensusType === 'THREE-WAY AGREEMENT'
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                                      : currentSignal.combinedAnalysis.consensusType === 'MAJORITY SIGNAL'
                                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
                                      : 'bg-purple-500/20 text-purple-200 border-purple-400/50'
                                  }`}
                                >
                                  {currentSignal.combinedAnalysis.agreementLabel}{' '}
                                  {currentSignal.combinedAnalysis.consensusType}
                                </span>
                              )}
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-300 font-mono truncate">
                              {aiStatus === 'analyzing' && useGeminiAi
                                ? `Reading 30 ${wingoInterval.toUpperCase()} verified draws via Gemini AI...`
                                : currentSignal.allWalletSureshot && currentSignal.sureshotNote
                                ? currentSignal.sureshotNote
                                : currentSignal.reasonSummary}
                            </span>
                          </div>

                          {currentSignal.combinedAnalysis &&
                            currentSignal.combinedAnalysis.activeCount >= 2 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                {[
                                  currentSignal.combinedAnalysis.strategies.patternBrain,
                                  currentSignal.combinedAnalysis.strategies.momentumTrend,
                                  currentSignal.combinedAnalysis.strategies.dragonContrarian,
                                ]
                                  .filter((s) => s.active)
                                  .map((s) => {
                                    const perfMap = currentSignal.combinedAnalysis?.strategyPerformance;
                                    const perf =
                                      s.id === 'pattern-ai'
                                        ? perfMap?.patternBrain
                                        : s.id === 'trend-follow'
                                        ? perfMap?.momentumTrend
                                        : perfMap?.dragonContrarian;
                                    return (
                                      <span
                                        key={s.id}
                                        className={`px-2 py-0.5 rounded border font-mono font-bold ${
                                          s.signal === 'BIG'
                                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                                            : s.signal === 'SMALL'
                                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35'
                                            : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                                        }`}
                                      >
                                        {s.name.split(' ')[0]}: {s.signal}
                                        {perf && perf.evaluated > 0 ? ` (${perf.hitRate}% · w${perf.weight})` : ''}
                                      </span>
                                    );
                                  })}
                              </div>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400 mr-1">
                            Last {currentSignal.lastResultsPreview.length}:
                          </span>
                          {currentSignal.lastResultsPreview.map((r, i) => (
                            <span
                              key={`${r.issueShort}-${i}`}
                              title={`Period #${r.issueShort}: ${r.number} (${r.actualResult})`}
                              className={`w-7 h-7 rounded-lg font-mono text-[11px] font-bold inline-flex items-center justify-center border ${
                                r.color === 'GREEN'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-400/35'
                              }`}
                            >
                              {r.number}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Strict AI PASS Access Gate or Active Gemini AI Controls */}
                      {aiUnlocked ? (
                        <div className="pt-2 border-t border-white/10 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={handleToggleGeminiAi}
                              className={`press-scale inline-flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                                useGeminiAi
                                  ? 'bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-400 text-white shadow-lg shadow-purple-500/30 ring-1 ring-white/30'
                                  : 'bg-white/10 hover:bg-white/20 text-emerald-300 border border-emerald-400/40'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                              {useGeminiAi
                                ? 'Gemini AI ACTIVE · Tap for Normal'
                                : 'Activate Gemini 4 AI (Autonomous 3-Strategy)'}
                            </button>
                            {useGeminiAi && (
                              <button
                                type="button"
                                disabled={aiStatus === 'analyzing'}
                                onClick={() => triggerAiPrediction(clock.periodId, true, wingoInterval)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 px-2.5 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3 h-3 ${aiStatus === 'analyzing' ? 'animate-spin' : ''}`} />
                                Re-Analyze Round
                              </button>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
                              <Brain className="w-3 h-3 text-purple-400" />
                              {user?.isAdmin
                                ? 'Admin AI PASS'
                                : `AI PASS · ${formatRemainingDuration(user?.aiPredExpiresAt, nowTick)}`}
                            </span>
                            {!user?.isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUnlockPlanId('weekly');
                                  setUnlockModalFeature('ai');
                                }}
                                className="text-[10px] font-bold text-cyan-300 hover:underline cursor-pointer px-1.5 py-1"
                              >
                                Extend
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowAiComparePopup(true)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/35 px-2.5 py-1 rounded-md cursor-pointer"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              AI vs Default Diff
                            </button>
                          </div>

                          {aiStatus === 'error' && aiError && useGeminiAi && (
                            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-1.5 font-mono">
                              AI Notice: {aiError}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 rounded-xl border border-amber-400/40 bg-gradient-to-r from-slate-900/95 via-purple-950/60 to-slate-900/95 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/45 flex items-center justify-center shrink-0">
                              <Lock className="w-5 h-5 text-amber-300" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-orbitron text-xs font-black uppercase tracking-wider text-amber-300">
                                AI PASS Required · Gemini AI Locked
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                {user?.aiPredExpiresAt
                                  ? 'Your AI PASS membership has expired. Renew your AI PASS to unlock Gemini 4 Hydrogen AI, all 3 strategies, and live AI prediction history.'
                                  : 'Only active AI PASS members can generate Gemini AI predictions or use combined 3-strategy consensus.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setShowAiComparePopup(true)}
                              className="min-h-[38px] px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-slate-200 cursor-pointer"
                            >
                              Compare
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUnlockPlanId('weekly');
                                setUnlockModalFeature('ai');
                              }}
                              className="btn-shine press-scale min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-300 text-slate-950 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                Purchase / Activate AI PASS (₹{platformConfig?.aiWeeklyPrice ?? 101}+)
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Premium Color & Number Predictions (Wallet Coin Unlocked) */}
                    {showColorNumberPred && (() => {
                      const colorUnlocked = isFeatureUnlocked(user?.colorPredExpiresAt, nowTick);
                      const numberUnlocked = isFeatureUnlocked(user?.numberPredExpiresAt, nowTick);
                      const colorRatePrice = platformConfig?.colorPredPrice ?? 10;
                      const colorRateHours = platformConfig?.colorPredHours ?? 48;
                      const numRatePrice = platformConfig?.numberPredPrice ?? 20;
                      const numRateHours = platformConfig?.numberPredHours ?? 24;
                      return (
                        <div className="relative z-10 mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Color Prediction Slot */}
                          <div className="rounded-xl bg-black/50 border border-white/10 p-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                Color Prediction
                              </div>
                              {colorUnlocked ? (
                                currentSignal.label === 'INSUFFICIENT_DATA' ||
                                currentSignal.label === 'SKIP' ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="font-orbitron text-xs font-black px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                      {currentSignal.label === 'SKIP'
                                        ? 'SKIP · WAIT ROUND'
                                        : 'WAIT FOR DRAWS'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span
                                      className={`font-orbitron text-sm font-black px-2.5 py-0.5 rounded-md ${
                                        currentSignal.color === 'GREEN'
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                          : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                                      }`}
                                    >
                                      {currentSignal.color}
                                    </span>
                                    {currentSignal.hasViolet && (
                                      <span className="font-orbitron text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-500/25 text-purple-200 border border-purple-400/40">
                                        + VIOLET
                                      </span>
                                    )}
                                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRemainingDuration(user?.colorPredExpiresAt, nowTick)}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
                                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>Locked · ₹{colorRatePrice} / {colorRateHours}h</span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setUnlockModalFeature('color')}
                              className={`min-h-[36px] px-3 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors press-scale ${
                                colorUnlocked
                                  ? 'bg-white/10 hover:bg-white/15 text-slate-200'
                                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              }`}
                            >
                              {colorUnlocked ? 'Extend' : `Unlock ₹${colorRatePrice}`}
                            </button>
                          </div>

                          {/* Number Prediction Slot */}
                          <div className="rounded-xl bg-black/50 border border-white/10 p-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                Number Prediction (0–9)
                              </div>
                              {numberUnlocked ? (
                                currentSignal.label === 'INSUFFICIENT_DATA' ||
                                currentSignal.label === 'SKIP' ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="font-orbitron text-xs font-black px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                      {currentSignal.label === 'SKIP'
                                        ? 'SKIP · WAIT ROUND'
                                        : 'WAIT FOR DRAWS'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span
                                      className={`font-orbitron text-lg font-black w-8 h-8 rounded-full inline-flex items-center justify-center border ${
                                        currentSignal.hasViolet
                                          ? 'bg-gradient-to-br from-purple-600 to-emerald-500 text-white border-purple-300/60'
                                          : currentSignal.color === 'GREEN'
                                          ? 'bg-emerald-600 text-white border-emerald-300/50'
                                          : 'bg-rose-600 text-white border-rose-300/50'
                                      }`}
                                    >
                                      {currentSignal.number}
                                    </span>
                                    <span className="text-xs font-bold text-slate-200">
                                      Pick #{currentSignal.number}
                                    </span>
                                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRemainingDuration(user?.numberPredExpiresAt, nowTick)}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
                                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>Locked · ₹{numRatePrice} / {numRateHours}h</span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setUnlockModalFeature('number')}
                              className={`min-h-[36px] px-3 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors press-scale ${
                                numberUnlocked
                                  ? 'bg-white/10 hover:bg-white/15 text-slate-200'
                                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              }`}
                            >
                              {numberUnlocked ? 'Extend' : `Unlock ₹${numRatePrice}`}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                </div>

                {/* Live AI Prediction History (AI PASS Members Only) */}
                {aiUnlocked && (
                  <section
                    className="rounded-2xl border p-4 sm:p-5 space-y-3"
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                        <h2
                          className="font-orbitron text-xs font-bold tracking-wider uppercase"
                          style={{ color: theme.accent }}
                        >
                          AI Prediction History ({wingoInterval.toUpperCase()})
                        </h2>
                        {settledAiRows.length > 0 && (
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/35">
                            {aiHistoryWins}/{settledAiRows.length} WIN ({aiHistoryRate}%)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadAiHistory()}
                        className="min-h-[32px] px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${aiHistoryLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {safeAiHistory.length === 0 ? (
                      <div className="text-xs text-slate-400 py-3 text-center">
                        Activate Gemini AI above to log and auto-settle round predictions continuously without duplicates.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                        {safeAiHistory.map((item) => (
                          <div
                            key={`${item.interval}-${item.periodId}`}
                            className="rounded-xl bg-black/45 border border-white/10 px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-orbitron text-[11px] font-bold text-[#ffd700] tabular-nums">
                                  #{item.periodId.slice(-4)}
                                </span>
                                <span
                                  className={`font-orbitron text-[11px] font-black px-1.5 py-0.5 rounded ${
                                    item.signal === 'SKIP'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : item.signal === 'BIG'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-cyan-500/20 text-cyan-300'
                                  }`}
                                >
                                  {item.signal}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {item.confidence}%
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {item.selectedStrategy}
                                {item.actualResult
                                  ? ` · Actual: ${item.actualResult} (${item.actualNumber})`
                                  : ' · Waiting draw'}
                              </div>
                            </div>
                            <span
                              className={`font-orbitron text-[10px] font-black px-2 py-1 rounded shrink-0 ${
                                item.outcome === 'WIN'
                                  ? 'bg-[#00ff88]/20 text-[#00ff88]'
                                  : item.outcome === 'LOSS'
                                  ? 'bg-[#ff3c78]/20 text-[#ff3c78]'
                                  : 'bg-amber-400/20 text-amber-300'
                              }`}
                            >
                              {item.outcome}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Two-Column Content: Left = Amount & Level Controls, Right = Win/Loss History */}
                {menuType !== 'compact-hud' && (showLevelSplit || showManualHistory) && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Left: Amount, 1-5 Level Splitter & WIN/LOSS Controls */}
                  {showLevelSplit && (
                  <section
                    className={`${showManualHistory ? 'lg:col-span-5' : 'lg:col-span-12'} rounded-2xl border p-4 sm:p-5 space-y-4`}
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <h2
                        className="font-orbitron text-xs font-bold tracking-wider uppercase"
                        style={{ color: theme.accent }}
                      >
                        Amount & 1–5 Level Control
                      </h2>
                      {sessionActive && (
                        <button
                          type="button"
                          onClick={handleResetSession}
                          className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Change Setup
                        </button>
                      )}
                    </div>

                    {!sessionActive ? (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-slate-300 font-medium mb-2">
                            Enter Amount (₹100, ₹300, ₹500, ₹2000 or custom)
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-2.5">
                            {['100', '300', '500', '2000'].map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => setDepositInput(amt)}
                                style={
                                  depositInput === amt
                                    ? {
                                        backgroundColor: theme.accentSoft,
                                        borderColor: theme.accent,
                                        color: theme.accent,
                                      }
                                    : undefined
                                }
                                className={`font-orbitron min-h-[42px] rounded-xl text-xs font-bold border cursor-pointer ${
                                  depositInput === amt
                                    ? ''
                                    : 'bg-white/5 border-white/15 text-white hover:border-white/30'
                                }`}
                              >
                                ₹{amt}
                              </button>
                            ))}
                          </div>
                          <input
                            type="number"
                            min={10}
                            value={depositInput}
                            onChange={(e) => setDepositInput(e.target.value)}
                            style={{ borderColor: theme.borderColor }}
                            className="font-orbitron w-full py-3 px-4 rounded-xl bg-black/70 border text-white text-xl font-bold text-center outline-none tabular-nums"
                          />
                        </div>

                        <div>
                          <div className="text-xs text-slate-300 font-medium mb-2">
                            Split Across Levels (1 to 5)
                          </div>
                          <div className="grid grid-cols-5 gap-2 mb-2.5">
                            {[1, 2, 3, 4, 5].map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setMaxLevels(lvl)}
                                className={`font-orbitron min-h-[42px] rounded-xl text-sm font-bold border cursor-pointer ${
                                  maxLevels === lvl
                                    ? 'text-white'
                                    : 'border-white/15 bg-white/[0.04] text-slate-300'
                                }`}
                                style={
                                  maxLevels === lvl
                                    ? {
                                        borderColor: theme.accent,
                                        background: theme.accentSoft,
                                      }
                                    : undefined
                                }
                              >
                                {lvl}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setSplitMode('progressive')}
                              className={`min-h-[40px] rounded-xl border text-xs font-bold cursor-pointer ${
                                splitMode === 'progressive'
                                  ? 'border-[#ffd700] text-[#ffd700] bg-[#ffd700]/10'
                                  : 'border-white/15 bg-white/[0.04] text-slate-400'
                              }`}
                            >
                              2x Level Split
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitMode('equal')}
                              className={`min-h-[40px] rounded-xl border text-xs font-bold cursor-pointer ${
                                splitMode === 'equal'
                                  ? 'border-[#ffd700] text-[#ffd700] bg-[#ffd700]/10'
                                  : 'border-white/15 bg-white/[0.04] text-slate-400'
                              }`}
                            >
                              Equal Split
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5">
                          {levelBets.map((b, i) => (
                            <div
                              key={i}
                              className="font-orbitron text-center bg-black/60 border rounded-xl py-2 px-1"
                              style={{ borderColor: theme.borderColor }}
                            >
                              <div className="text-[10px] text-slate-400">L{i + 1}</div>
                              <div className="text-xs font-bold text-[#ffd700] tabular-nums mt-0.5">
                                ₹{b}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleStartEngine}
                          className={`font-orbitron w-full min-h-[48px] rounded-xl font-black text-sm uppercase cursor-pointer ${
                            theme.ctaTextDark ? 'text-slate-950' : 'text-white'
                          }`}
                          style={{
                            background: theme.ctaGradient,
                          }}
                        >
                          Start Session
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5">
                          <div className="bg-black/50 border border-white/10 rounded-xl p-3">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                              Safety Wallet Left
                            </div>
                            <div
                              className="font-orbitron text-lg font-black tabular-nums mt-0.5"
                              style={{ color: currentWallet <= 0 ? '#ff3c78' : '#00ff88' }}
                            >
                              ₹{currentWallet}
                            </div>
                          </div>
                          <div className="bg-black/50 border border-white/10 rounded-xl p-3">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                              Current Level
                            </div>
                            <div
                              className="font-orbitron text-lg font-black tabular-nums mt-0.5"
                              style={{ color: theme.accent }}
                            >
                              {currentLevel} / {maxLevels}
                            </div>
                          </div>
                          <div className="bg-black/50 border border-white/10 rounded-xl p-3">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                              Play Bet
                            </div>
                            <div className="font-orbitron text-lg font-black text-[#ffd700] tabular-nums mt-0.5">
                              ₹{currentBet}
                            </div>
                          </div>
                          <div className="bg-black/50 border border-white/10 rounded-xl p-3">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                              Total Loss
                            </div>
                            <div className="font-orbitron text-lg font-black text-[#ff3c78] tabular-nums mt-0.5">
                              ₹{totalLoss}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 mb-1.5">
                            Level Ladder (Tap to jump level)
                          </div>
                          <div
                            className="grid gap-2"
                            style={{ gridTemplateColumns: `repeat(${maxLevels}, minmax(0, 1fr))` }}
                          >
                            {levelBets.map((bet, idx) => {
                              const lvlNum = idx + 1;
                              return (
                                <button
                                  key={lvlNum}
                                  type="button"
                                  onClick={() => setCurrentLevel(lvlNum)}
                                  className={`font-orbitron py-2 px-1 rounded-xl border text-[11px] cursor-pointer ${
                                    lvlNum === currentLevel
                                      ? 'border-[#ffd700] bg-[#ffd700]/15 text-white'
                                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/30'
                                  }`}
                                >
                                  L{lvlNum}
                                  <span className="block text-xs font-black text-[#ffd700] tabular-nums mt-0.5">
                                    ₹{bet}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bg-white/[0.04] rounded-xl px-3.5 py-2.5 border border-amber-400/25 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Next Level Target Bet</span>
                            <span className="font-orbitron font-bold text-[#ffd700] tabular-nums">
                              ₹{nextLevelBet}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                            <span className="text-slate-400">WIN/LOSS logs previous period</span>
                            <span
                              className="font-orbitron font-bold tabular-nums"
                              style={{ color: theme.accent }}
                            >
                              #{settledPeriodId.slice(-4)} · {settledSignal.label}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={handleWinClick}
                            className="font-orbitron min-h-[50px] rounded-xl bg-[#00ff88] hover:bg-[#00e67a] text-black text-xs font-black cursor-pointer inline-flex items-center justify-center gap-1.5"
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>WIN #{settledPeriodId.slice(-4)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleLossClick}
                            className="font-orbitron min-h-[50px] rounded-xl bg-[#ff3c78] hover:bg-[#f02866] text-white text-xs font-black cursor-pointer inline-flex items-center justify-center gap-1.5"
                          >
                            <TrendingDown className="w-4 h-4" />
                            <span>LOSS #{settledPeriodId.slice(-4)}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                  )}

                  {/* Right: Manual Win / Loss History */}
                  {showManualHistory && (
                  <div className={showLevelSplit ? 'lg:col-span-7' : 'lg:col-span-12'}>
                    <section
                      className="rounded-2xl border p-4 sm:p-5 space-y-4"
                      style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.borderColor,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <div>
                          <h2
                            className="font-orbitron text-xs font-bold tracking-wider uppercase"
                            style={{ color: theme.secondaryAccent }}
                          >
                            Win / Loss History
                          </h2>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Logs previous settled period (#{settledPeriodId.slice(-4)} · {settledSignal.label}) for {game.name}
                          </p>
                        </div>
                        {roundHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearModHistory}
                            className="min-h-[34px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-black/45 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Rounds</div>
                          <div className="font-orbitron text-lg font-black text-white tabular-nums mt-0.5">
                            {historyStats.total}
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Wins / Losses</div>
                          <div className="font-orbitron text-lg font-black tabular-nums mt-0.5">
                            <span className="text-[#00ff88]">{historyStats.wins}</span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span className="text-[#ff3c78]">{historyStats.losses}</span>
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Win Rate</div>
                          <div
                            className="font-orbitron text-lg font-black tabular-nums mt-0.5"
                            style={{ color: theme.accent }}
                          >
                            {historyStats.winRate}%
                          </div>
                        </div>
                        <div className="bg-black/45 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Session P&L</div>
                          <div
                            className="font-orbitron text-lg font-black tabular-nums mt-0.5"
                            style={{
                              color: historyStats.netPnl >= 0 ? '#00ff88' : '#ff3c78',
                            }}
                          >
                            {historyStats.netPnl >= 0
                              ? `+₹${historyStats.netPnl}`
                              : `-₹${Math.abs(historyStats.netPnl)}`}
                          </div>
                        </div>
                      </div>

                      {roundHistory.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/15 bg-black/30 p-8 text-center">
                          <div className="text-sm font-semibold text-slate-300">
                            No WIN or LOSS rounds recorded yet
                          </div>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Start a session on the left panel with your chosen amount and levels (1–5), then record WIN or LOSS outcomes (counts 1 previous period).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                          {roundHistory.map((row) => {
                            const isWin = row.outcome === 'WIN';
                            return (
                              <div
                                key={row.id}
                                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/45 px-3.5 py-2.5"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`font-orbitron text-[11px] font-black px-2 py-0.5 rounded ${
                                        isWin
                                          ? 'bg-[#00ff88]/15 text-[#00ff88]'
                                          : 'bg-[#ff3c78]/15 text-[#ff3c78]'
                                      }`}
                                    >
                                      {row.outcome}
                                    </span>
                                    <span className="font-orbitron text-xs text-[#ffd700] font-bold tabular-nums">
                                      {row.periodId}
                                    </span>
                                    <span
                                      className={`font-orbitron text-[11px] font-bold ${
                                        row.signal === 'BIG' ? 'text-[#00ff88]' : 'text-[#00f2ff]'
                                      }`}
                                    >
                                      {row.signal}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                                    Level {row.level}/{row.maxLevels} · Bet ₹{row.betAmount} · {row.recordedAt}
                                  </div>
                                </div>

                                <div
                                  className="font-orbitron text-sm font-black tabular-nums shrink-0"
                                  style={{ color: isWin ? '#00ff88' : '#ff3c78' }}
                                >
                                  {row.pnlDelta >= 0
                                    ? `+₹${row.pnlDelta}`
                                    : `-₹${Math.abs(row.pnlDelta)}`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                  )}
                </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Full-Width Easy Exit Dock */}
        <footer className="h-14 px-4 bg-slate-950 border-t border-slate-800 flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="press-scale w-full max-w-md min-h-[42px] px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            Close Game &amp; Return to Arena
          </button>
        </footer>

        {showAiComparePopup && (
          <AiPassComparisonModal
            mode="auto-popup"
            user={user}
            platformConfig={platformConfig}
            onClose={() => setShowAiComparePopup(false)}
            onSelectPlan={(planId) => {
              setShowAiComparePopup(false);
              setUnlockPlanId(planId || 'weekly');
              setUnlockModalFeature('ai');
            }}
          />
        )}

        {unlockModalFeature && (
          <PredictionUnlockModal
            feature={unlockModalFeature}
            initialPlanId={unlockPlanId}
            user={user}
            platformConfig={platformConfig}
            onClose={() => setUnlockModalFeature(null)}
            onUserUpdated={onUserUpdated}
            onGoToWallet={onGoToWallet}
            onRequireAuth={onRequireAuth}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-modal-pop w-full max-w-md studio-card rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b studio-divider studio-muted flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{game.title}</h2>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              {game.pricing_type === 'free'
                ? 'Free Access'
                : `Paid Entry · ${formatCurrency(game.price)} (${
                    game.billing_mode === 'once' ? 'One-Time Unlock' : 'Per Play'
                  })`}
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
            {game.pricing_type === 'free' ? 'FREE' : 'VIP'}
          </span>
        </div>

        <div className="p-6">
          {!user ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl studio-muted border text-sm text-[var(--text-muted)]">
                Sign in or create a player account to launch <strong className="text-[var(--text-primary)]">{game.name}</strong>.
              </div>
              <button
                type="button"
                onClick={onRequireAuth}
                className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn font-bold text-sm cursor-pointer"
              >
                Sign In or Register to Play
              </button>
            </div>
          ) : needsPayment ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl ink-card text-white flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Entry Fee</div>
                  <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                    {formatCurrency(game.price)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Your Wallet</div>
                  <div
                    className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                      user.walletBalance >= game.price ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(user.walletBalance)}
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-medium flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{error}</div>
                </div>
              )}

              {insufficientFunds && (
                <button
                  type="button"
                  onClick={() => onGoToWallet(Math.max(100, Math.ceil(game.price)))}
                  className="btn-shine press-scale w-full min-h-[44px] rounded-xl bg-[#d97706] hover:bg-[#b45309] text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  Add Funds via Payment Gateway
                </button>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={launchGame}
                className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn disabled:opacity-60 font-bold text-sm cursor-pointer"
              >
                {loading
                  ? 'Processing...'
                  : `Pay ${formatCurrency(game.price)} & Launch Game`}
              </button>
            </div>
          ) : (
            <div className="space-y-4 text-center py-6">
              {error ? (
                <>
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-medium flex items-start gap-2.5 text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>{error}</div>
                  </div>
                  <button
                    type="button"
                    onClick={launchGame}
                    className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn font-bold text-sm cursor-pointer"
                  >
                    Retry Launch
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="w-10 h-10 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                  <div className="text-sm font-bold">
                    Launching {game.name}...
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Preparing full-screen session & AI live result analyzer.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="press-scale mt-4 w-full min-h-[46px] rounded-xl studio-muted border text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
