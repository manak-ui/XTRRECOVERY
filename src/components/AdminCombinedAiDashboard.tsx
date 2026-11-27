import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cpu,
  Flame,
  Layers,
  Power,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { StrategyConfigState, WingoInterval } from '../types';
import {
  fetchPartnerWingoIssue,
  fetchPartnerWingoResults,
  getWingoClock,
  normalizeStrategyConfig,
  runCombinedWingoEngine,
  type IndividualStrategyAnalysis,
  type PartnerWingoResultItem,
  type WingoClock,
} from '../utils/wingo';

interface AdminCombinedAiDashboardProps {
  strategyConfig: StrategyConfigState;
  savingStrategies: boolean;
  onUpdateStrategies: (next: StrategyConfigState) => Promise<void> | void;
}

export const AdminCombinedAiDashboard: React.FC<AdminCombinedAiDashboardProps> = ({
  strategyConfig,
  savingStrategies,
  onUpdateStrategies,
}) => {
  const normalizedCfg = useMemo(
    () => normalizeStrategyConfig(strategyConfig),
    [strategyConfig]
  );

  const [intervalMode, setIntervalMode] = useState<WingoInterval>('1m');
  const [clock, setClock] = useState<WingoClock>(() =>
    getWingoClock('yaarwin', '1m', 0, 'utc-partner-api')
  );
  const [drawsByInterval, setDrawsByInterval] = useState<
    Record<WingoInterval, PartnerWingoResultItem[]>
  >({
    '30s': [],
    '1m': [],
  });
  const [analysisStatus, setAnalysisStatus] = useState<'Processing' | 'Completed'>('Processing');
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [fetchSourceLabel, setFetchSourceLabel] = useState<string>('Checking live draws...');

  const inFlightRef = useRef<boolean>(false);
  const lastFetchedKeyRef = useRef<string>('');
  const liveWindowRef = useRef<{ interval: WingoInterval; issueNumber: string; endMs: number } | null>(
    null
  );

  const refreshLiveAnalysis = useCallback(
    async (targetInterval: WingoInterval, targetPeriod: string, force = false) => {
      const fetchKey = `${targetInterval}:${targetPeriod}`;
      if (!force && (inFlightRef.current || lastFetchedKeyRef.current === fetchKey)) {
        return;
      }
      inFlightRef.current = true;
      setAnalysisStatus('Processing');
      try {
        const [issueRes, list] = await Promise.all([
          fetchPartnerWingoIssue(targetInterval).catch(() => null),
          fetchPartnerWingoResults(30, targetInterval).catch(() => [] as PartnerWingoResultItem[]),
        ]);

        if (issueRes?.issueNumber) {
          liveWindowRef.current = {
            interval: targetInterval,
            issueNumber: issueRes.issueNumber,
            endMs: Date.now() + issueRes.secLeft * 1000,
          };
          setClock({
            periodId: issueRes.issueNumber,
            secLeft: issueRes.secLeft,
          });
        }

        if (Array.isArray(list) && list.length > 0) {
          setDrawsByInterval((prev) => ({
            ...prev,
            [targetInterval]: list,
          }));
          setFetchSourceLabel(`${list.length} real ${targetInterval.toUpperCase()} draws loaded`);
        } else {
          setFetchSourceLabel(`No live ${targetInterval.toUpperCase()} draws cached yet`);
        }
        lastFetchedKeyRef.current = `${targetInterval}:${issueRes?.issueNumber || targetPeriod}`;
        setLastFetchedAt(
          new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } finally {
        inFlightRef.current = false;
        setAnalysisStatus('Completed');
      }
    },
    []
  );

  useEffect(() => {
    liveWindowRef.current = null;
    const initClock = getWingoClock('yaarwin', intervalMode, 0, 'utc-partner-api');
    setClock(initClock);
    void refreshLiveAnalysis(intervalMode, initClock.periodId, true);

    const tickId = window.setInterval(() => {
      if (liveWindowRef.current && liveWindowRef.current.interval === intervalMode) {
        const rem = Math.ceil((liveWindowRef.current.endMs - Date.now()) / 1000);
        if (rem > 0) {
          setClock({
            periodId: liveWindowRef.current.issueNumber,
            secLeft: Math.min(intervalMode === '30s' ? 30 : 60, rem),
          });
          return;
        }
      }
      const nextClk = getWingoClock('yaarwin', intervalMode, 0, 'utc-partner-api');
      setClock(nextClk);
      if (`${intervalMode}:${nextClk.periodId}` !== lastFetchedKeyRef.current) {
        void refreshLiveAnalysis(intervalMode, nextClk.periodId);
      }
    }, 1000);

    return () => window.clearInterval(tickId);
  }, [intervalMode, refreshLiveAnalysis]);

  const activeDraws = drawsByInterval[intervalMode] || [];
  const combined = useMemo(
    () =>
      runCombinedWingoEngine(activeDraws, clock.periodId, {
        interval: intervalMode,
        strategyConfig: normalizedCfg,
      }),
    [activeDraws, clock.periodId, intervalMode, normalizedCfg]
  );

  const handleToggleMasterAllThree = () => {
    if (savingStrategies) return;
    const nextActive = !normalizedCfg.allThreeStrategiesActive;
    void onUpdateStrategies({
      patternBrainEnabled: nextActive,
      momentumTrendEnabled: nextActive,
      dragonContrarianEnabled: nextActive,
      allThreeStrategiesActive: nextActive,
    });
  };

  const handleToggleSingleStrategy = (key: 'pattern' | 'momentum' | 'contrarian') => {
    if (savingStrategies) return;
    const nextPattern =
      key === 'pattern' ? !normalizedCfg.patternBrainEnabled : normalizedCfg.patternBrainEnabled;
    const nextMomentum =
      key === 'momentum' ? !normalizedCfg.momentumTrendEnabled : normalizedCfg.momentumTrendEnabled;
    const nextContrarian =
      key === 'contrarian'
        ? !normalizedCfg.dragonContrarianEnabled
        : normalizedCfg.dragonContrarianEnabled;
    void onUpdateStrategies({
      patternBrainEnabled: nextPattern,
      momentumTrendEnabled: nextMomentum,
      dragonContrarianEnabled: nextContrarian,
      allThreeStrategiesActive: nextPattern && nextMomentum && nextContrarian,
    });
  };

  const renderStrategyCard = (
    strat: IndividualStrategyAnalysis,
    toggleKey: 'pattern' | 'momentum' | 'contrarian',
    icon: React.ReactNode,
    subtitle: string
  ) => {
    const perf =
      toggleKey === 'pattern'
        ? combined.strategyPerformance.patternBrain
        : toggleKey === 'momentum'
        ? combined.strategyPerformance.momentumTrend
        : combined.strategyPerformance.dragonContrarian;

    const signalBadgeClass =
      strat.signal === 'BIG'
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
        : strat.signal === 'SMALL'
        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
        : 'bg-amber-500/20 text-amber-300 border-amber-400/50';

    const agreesWithCombined =
      strat.active &&
      (combined.finalSignal === 'BIG' || combined.finalSignal === 'SMALL') &&
      strat.signal === combined.finalSignal;
    const conflictsWithCombined =
      strat.active &&
      (combined.finalSignal === 'BIG' || combined.finalSignal === 'SMALL') &&
      strat.signal !== 'NEUTRAL' &&
      strat.signal !== combined.finalSignal;

    return (
      <div
        key={strat.id}
        className={`relative rounded-2xl p-4 sm:p-5 border transition-all duration-300 ${
          strat.active
            ? agreesWithCombined
              ? 'bg-[#091224] border-emerald-400/60 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
              : conflictsWithCombined
              ? 'bg-[#120a18] border-rose-400/50 shadow-[0_0_20px_rgba(244,63,94,0.14)]'
              : 'bg-[#0a1020] border-cyan-400/50 shadow-[0_0_22px_rgba(6,182,212,0.14)]'
            : 'bg-slate-950/75 border-slate-800 opacity-75'
        }`}
      >
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                {strat.name}
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">{subtitle}</p>
          </div>
          <button
            type="button"
            disabled={savingStrategies}
            onClick={() => handleToggleSingleStrategy(toggleKey)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
              strat.active
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {strat.active ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Individual Signal
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`font-orbitron text-xs font-black px-2.5 py-1 rounded-lg border ${signalBadgeClass}`}
              >
                {strat.signal}
              </span>
              {strat.confidence > 0 && (
                <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                  {strat.confidence}%
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Backtest · Weight
            </div>
            <div className="font-mono text-xs font-extrabold text-cyan-300 tabular-nums mt-1">
              {perf.hitRate !== null ? `${perf.hitRate}% (${perf.evaluated}r)` : 'Warming'} · {perf.weight}x
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-300 leading-relaxed min-h-[34px]">
          {strat.reason}
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
          {strat.metrics.slice(0, 4).map((m) => (
            <div key={m.label} className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-slate-400">{m.label}</div>
              <div className="font-mono text-[11px] font-bold text-slate-100 tabular-nums truncate">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const timerFormatted = `00:${clock.secLeft < 10 ? `0${clock.secLeft}` : clock.secLeft}`;
  const isAllThree = normalizedCfg.allThreeStrategiesActive;

  const consensusBadgeStyle =
    combined.consensusType === 'THREE-WAY AGREEMENT'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.28)]'
      : combined.consensusType === 'MAJORITY SIGNAL'
      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-[0_0_18px_rgba(6,182,212,0.22)]'
      : combined.consensusType === 'AUTONOMOUS WEIGHTED'
      ? 'bg-purple-500/20 text-purple-300 border-purple-400/60 shadow-[0_0_18px_rgba(168,85,247,0.22)]'
      : combined.consensusType === 'SINGLE STRATEGY'
      ? 'bg-blue-500/20 text-blue-300 border-blue-400/60'
      : 'bg-rose-500/20 text-rose-300 border-rose-400/60 shadow-[0_0_18px_rgba(244,63,94,0.2)]';

  return (
    <div className="space-y-5">
      {/* Master Neon "ACTIVATE ALL 3 STRATEGIES" Command Card */}
      <div className="relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-emerald-400 shadow-[0_0_36px_rgba(168,85,247,0.28)]">
        <div className="relative rounded-[15px] bg-[#060814] p-5 sm:p-6 text-white space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-cyan-300">
                <Cpu className="w-4 h-4 text-fuchsia-400" />
                <span>Real-Time Multi-Strategy Autonomous Engine</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
                3-Strategy Combined AI Predictor Control
              </h3>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Runs Pattern Brain AI, Momentum Trend Follow, and Dragon Contrarian Reversal
                simultaneously with walk-forward backtest weighting — autonomously selecting BIG or SMALL on verified draws.
              </p>
            </div>

            {/* Master Neon Animated Button */}
            <button
              type="button"
              disabled={savingStrategies}
              onClick={handleToggleMasterAllThree}
              className={`group relative overflow-hidden rounded-2xl px-5 py-4 sm:px-7 sm:py-4 font-orbitron font-black text-xs sm:text-sm tracking-wider uppercase transition-all duration-300 cursor-pointer press-scale w-full lg:w-auto shrink-0 border-2 ${
                isAllThree
                  ? 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-fuchsia-500 text-slate-950 border-white/80 shadow-[0_0_32px_rgba(16,185,129,0.65)]'
                  : 'bg-[#0b1024] text-white border-cyan-400/70 hover:border-fuchsia-400 shadow-[0_0_26px_rgba(0,242,255,0.35)] hover:shadow-[0_0_36px_rgba(232,121,249,0.55)]'
              } disabled:opacity-60`}
            >
              <span
                className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
              <span className="relative z-10 flex flex-wrap items-center justify-center gap-2.5">
                <Power className={`w-4 h-4 ${isAllThree ? 'animate-pulse text-slate-950' : 'text-cyan-300'}`} />
                <span>
                  {savingStrategies
                    ? 'Updating Engine...'
                    : isAllThree
                    ? 'DEACTIVATE ALL 3 STRATEGIES'
                    : 'ACTIVATE ALL 3 STRATEGIES'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest border ${
                    isAllThree
                      ? 'bg-slate-950 text-emerald-300 border-emerald-400/60'
                      : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  }`}
                >
                  {isAllThree ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </span>
            </button>
          </div>

          {/* Live Telemetry & Wingo 30S / 1M Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-black/60 p-1 border border-white/15">
                <button
                  type="button"
                  onClick={() => setIntervalMode('30s')}
                  className={`px-3 py-1.5 rounded-lg font-orbitron text-[11px] font-bold cursor-pointer transition-all ${
                    intervalMode === '30s'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  WINGO 30S
                </button>
                <button
                  type="button"
                  onClick={() => setIntervalMode('1m')}
                  className={`px-3 py-1.5 rounded-lg font-orbitron text-[11px] font-bold cursor-pointer transition-all ${
                    intervalMode === '1m'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  WINGO 1M
                </button>
              </div>

              <span className="font-orbitron text-[11px] bg-white/[0.06] border border-white/10 px-3 py-1.5 rounded-xl text-slate-300 tabular-nums">
                PERIOD <strong className="text-amber-300 ml-1">{clock.periodId}</strong>
              </span>
              <span className="font-orbitron text-[11px] bg-white/[0.06] border border-white/10 px-3 py-1.5 rounded-xl text-slate-300 tabular-nums">
                TIMER <strong className="text-cyan-300 ml-1">{timerFormatted}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
                  analysisStatus === 'Processing'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                }`}
              >
                <Activity
                  className={`w-3.5 h-3.5 ${analysisStatus === 'Processing' ? 'animate-spin' : ''}`}
                />
                Status: {analysisStatus}
              </span>
              <button
                type="button"
                onClick={() => void refreshLiveAnalysis(intervalMode, clock.periodId, true)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${analysisStatus === 'Processing' ? 'animate-spin' : ''}`}
                />
                Recalculate
              </button>
            </div>
          </div>

          {/* Combined Prediction Dashboard Hero Summary */}
          <div className="rounded-2xl bg-black/55 border border-white/15 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold flex flex-wrap items-center gap-2">
                  <span>Autonomous Decision Output</span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
                    {combined.selectedApproach}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`font-orbitron text-3xl sm:text-4xl font-black tracking-wider ${
                      combined.finalSignal === 'BIG'
                        ? 'text-emerald-400'
                        : combined.finalSignal === 'SMALL'
                        ? 'text-cyan-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {combined.finalSignal}
                  </span>
                  <span
                    className={`font-orbitron text-[11px] font-black px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${consensusBadgeStyle}`}
                  >
                    {combined.consensusType === 'THREE-WAY AGREEMENT' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : combined.consensusType === 'MAJORITY SIGNAL' ||
                      combined.consensusType === 'AUTONOMOUS WEIGHTED' ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {combined.consensusType}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{combined.summaryReason}</p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 shrink-0">
                <div className="rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Agreement</div>
                  <div className="font-orbitron text-lg font-black text-white tabular-nums mt-0.5">
                    {combined.agreementLabel}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Confidence</div>
                  <div
                    className={`font-orbitron text-base font-black mt-0.5 ${
                      combined.confidenceLevel === 'High'
                        ? 'text-emerald-400'
                        : combined.confidenceLevel === 'Medium'
                        ? 'text-cyan-300'
                        : 'text-amber-300'
                    }`}
                  >
                    {combined.confidenceLevel}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Weighted Score</div>
                  <div className="font-orbitron text-base font-black text-amber-300 tabular-nums mt-0.5">
                    {combined.combinedScore > 0
                      ? `+${combined.combinedScore}`
                      : combined.combinedScore}
                  </div>
                </div>
              </div>
            </div>

            {/* Agreement & Conflict Transparency + Real Draw Strip */}
            <div className="pt-3 border-t border-white/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {combined.agreeingStrategies.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Agree: {combined.agreeingStrategies.join(', ')}
                  </span>
                )}
                {combined.disagreeingStrategies.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/30">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Disagree: {combined.disagreeingStrategies.join(', ')}
                  </span>
                )}
                {combined.neutralStrategies.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/30">
                    Neutral: {combined.neutralStrategies.join(', ')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">
                  {fetchSourceLabel}
                  {lastFetchedAt ? ` · ${lastFetchedAt}` : ''}:
                </span>
                {combined.recentPreview.length > 0 ? (
                  combined.recentPreview.map((item, idx) => (
                    <span
                      key={`${item.issueShort}-${idx}`}
                      title={`#${item.issueShort}: ${item.number} (${item.actualResult})`}
                      className={`w-6 h-6 rounded-md font-mono text-[11px] font-bold inline-flex items-center justify-center border ${
                        item.color === 'GREEN'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                      }`}
                    >
                      {item.number}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-amber-300 font-semibold">
                    Open any game & toggle {intervalMode.toUpperCase()} to sync live draws
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3 Strategy Live Execution Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderStrategyCard(
              combined.strategies.patternBrain,
              'pattern',
              <Brain className="w-4 h-4 text-cyan-400 shrink-0" />,
              'ABAB zig-zags, streak breaks, 2-2 mirror blocks, 10R equilibrium & digit gaps.'
            )}
            {renderStrategyCard(
              combined.strategies.momentumTrend,
              'momentum',
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />,
              'Recent BIG/SMALL runs, 3R/5R/8R velocity, and trend strength acceleration.'
            )}
            {renderStrategyCard(
              combined.strategies.dragonContrarian,
              'contrarian',
              <Flame className="w-4 h-4 text-fuchsia-400 shrink-0" />,
              'Repeated same-side sequence exhaustion & empirical mean-reversion flip odds.'
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Active Strategies: <strong className="text-white">{combined.activeCount}/3</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              All decisions run on verified historical draws with dynamic walk-forward weights — zero random picks.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
