import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { formatCurrency } from '../api';
import type { AiPlanId, PlatformConfig, UserProfile } from '../types';
import {
  formatRemainingDuration,
  getAiSubscriptionPlans,
  isUserAiPassUnlocked,
} from '../utils/wingo';
import { AiPassBadge } from './AiPassBadge';

interface AiPassComparisonModalProps {
  mode: 'auto-popup' | 'hub';
  user: UserProfile | null;
  platformConfig?: PlatformConfig | null;
  onClose: () => void;
  onSelectPlan: (planId?: AiPlanId) => void;
}

export const AiPassComparisonModal: React.FC<AiPassComparisonModalProps> = ({
  mode,
  user,
  platformConfig,
  onClose,
  onSelectPlan,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const plans = useMemo(
    () => getAiSubscriptionPlans(platformConfig || undefined),
    [platformConfig]
  );
  const aiActive = isUserAiPassUnlocked(user);

  useEffect(() => {
    if (mode !== 'auto-popup') return undefined;
    setSecondsLeft(5);
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    const timer = window.setTimeout(() => {
      onClose();
    }, 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [mode, onClose]);

  const progressPct = mode === 'auto-popup' ? Math.max(0, (secondsLeft / 5) * 100) : 100;

  if (mode === 'auto-popup') {
    return (
      <div className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="animate-modal-pop w-full max-w-lg studio-card rounded-2xl overflow-hidden shadow-2xl border border-purple-500/45">
          {/* 5-second auto-close top timer bar */}
          <div className="h-1.5 w-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl accent-btn flex items-center justify-center shrink-0">
                  <Brain className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 inline-flex items-center gap-1.5">
                    <span>AI PASS Membership</span>
                    <AiPassBadge active={aiActive} size="xs" />
                  </div>
                  <h2 className="text-lg font-extrabold leading-tight">
                    Autonomous 3-Strategy Gemini AI
                  </h2>
                </div>
              </div>

              <span className="shrink-0 font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 tabular-nums inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {secondsLeft}s
              </span>
            </div>

            {/* Written Difference: Default vs AI Pass */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl studio-muted border p-3.5 space-y-2">
                <div className="font-extrabold text-[var(--text-secondary)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  Without AI PASS
                </div>
                <ul className="space-y-1.5 text-[var(--text-secondary)] leading-relaxed">
                  <li>• Gemini AI predictions locked (AI PASS required).</li>
                  <li>• No autonomous multi-strategy Gemini analysis.</li>
                  <li>• No continuous per-round AI prediction history.</li>
                </ul>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-purple-500/15 via-blue-500/15 to-emerald-500/15 border border-emerald-400/40 p-3.5 space-y-2">
                <div className="font-extrabold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  With AI PASS (₹{plans[0]?.price ?? 101}+)
                </div>
                <ul className="space-y-1.5 text-[var(--text-primary)] leading-relaxed">
                  <li>
                    • <strong>Autonomous Strategy Selection:</strong> Pattern Brain + Momentum + Contrarian run &amp; self-weight on live draws.
                  </li>
                  <li>
                    • <strong>Smart SKIP / WAIT Guard:</strong> Advises skipping confusing coin-flip rounds to protect your balance.
                  </li>
                  <li>• Full WIN/LOSS &amp; SKIP AI Prediction History + VIP badge.</li>
                </ul>
              </div>
            </div>

            {/* Compact 4-Plan Strip */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className="press-scale rounded-xl studio-muted border hover:border-[var(--accent-primary)] p-2 cursor-pointer transition-all"
                >
                  <div className="text-[10px] font-bold text-[var(--text-secondary)]">
                    {plan.durationLabel}
                  </div>
                  <div className="font-mono text-sm font-extrabold text-[var(--accent-primary)] mt-0.5 tabular-nums">
                    ₹{plan.price}
                  </div>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-center font-mono text-[var(--text-secondary)]">
              Auto-closing in {secondsLeft} second{secondsLeft === 1 ? '' : 's'} · Plans start at ₹{plans[0]?.price ?? 101}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectPlan('weekly')}
                className="btn-shine press-scale w-full min-h-[46px] rounded-xl accent-btn text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {aiActive
                  ? `Extend AI Pass (₹${plans[0]?.price ?? 101}+)`
                  : `Activate AI PASS Now (₹${plans[0]?.price ?? 101})`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="press-scale w-full min-h-[42px] rounded-xl studio-muted border text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Close Now ({secondsLeft}s)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full Header AI Pass & Comparison Hub Modal
  return (
    <div className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="animate-modal-pop w-full max-w-2xl studio-card rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto border border-purple-500/40">
        <div className="p-6 border-b studio-divider bg-gradient-to-r from-purple-600/20 via-blue-600/15 to-emerald-500/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl accent-btn flex items-center justify-center shrink-0">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 inline-flex items-center gap-2 flex-wrap">
                  <span>
                    {aiActive
                      ? user?.isAdmin
                        ? 'Admin AI Pass Active'
                        : `AI Pass Active · ${formatRemainingDuration(user?.aiPredExpiresAt)}`
                      : 'VIP Gemini 4 Hydrogen Live Engine'}
                  </span>
                  <AiPassBadge active={aiActive} size="xs" />
                </div>
                <h2 className="text-xl font-extrabold">
                  AI PASS Membership &amp; Autonomous Engine
                </h2>
              </div>
            </div>
            <span className="text-xs font-mono font-extrabold px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
              From ₹{plans[0]?.price ?? 101}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Written Difference Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl studio-muted border p-4 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                Free Account (No AI PASS)
              </div>
              <div className="space-y-2 text-[var(--text-secondary)] leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-rose-400">✕</span>
                  <span>
                    <strong>Gemini AI Restricted:</strong> Live Gemini 4 Hydrogen multi-strategy predictions require an active AI PASS.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-rose-400">✕</span>
                  <span>
                    <strong>No Walk-Forward Strategy Auto-Weighting:</strong> No autonomous 3-strategy combination scoring.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-rose-400">✕</span>
                  <span>
                    <strong>No AI PASS Badge or Live History:</strong> AI prediction WIN/LOSS ledger remains locked.
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-purple-500/15 via-blue-500/15 to-emerald-500/15 border border-emerald-400/45 p-4 space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Active AI PASS Membership
              </div>
              <div className="space-y-2 text-[var(--text-primary)] leading-relaxed">
                <div className="flex items-start gap-2">
                  <Layers className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    <strong>All 3 Strategies Combined:</strong> Runs Pattern Brain AI, Momentum Trend Follow, and Dragon Contrarian together with walk-forward backtest weights.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                  <span>
                    <strong>Smart SKIP Protection &amp; High-Accuracy Picks:</strong> Evaluates every 30s &amp; 1m round from verified draws, outputting BIG/SMALL on clear edges or SKIP when confusing.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>VIP Badge + Prediction History:</strong> Displays golden-neon AI PASS badge everywhere &amp; tracks settled WIN/LOSS accuracy per round.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* All 4 Updated Plan Cards */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                Choose Your AI Pass Plan (Tap to Buy / Extend)
              </span>
              <span className="font-mono text-emerald-400 font-bold">Instant Activation</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className="card-lift press-scale text-left rounded-xl p-4 studio-muted border hover:border-[var(--accent-primary)] transition-all cursor-pointer flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent-primary)]">
                        {plan.badge || 'AI PASS'}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {plan.durationLabel}
                      </span>
                    </div>
                    <div className="text-2xl font-extrabold font-mono tabular-nums mt-1.5">
                      {formatCurrency(plan.price)}
                    </div>
                    <div className="text-xs font-bold mt-0.5">{plan.label}</div>
                  </div>
                  <div className="pt-2 border-t studio-divider text-[11px] text-emerald-400 font-semibold">
                    {plan.savingsNote || 'Autonomous 3-Strategy Gemini AI'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => onSelectPlan('weekly')}
              className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {aiActive
                ? 'Extend Active Gemini AI Pass'
                : `Activate AI Pass Starting at ₹${plans[0]?.price ?? 101}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="press-scale w-full min-h-[46px] rounded-xl studio-muted border text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
