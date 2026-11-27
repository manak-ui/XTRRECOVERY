import React, { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { Lock, Wallet, Clock, AlertCircle, Sparkles, Brain, Check, PartyPopper, CheckCircle2 } from 'lucide-react';
import { ApiError, apiRequest, formatCurrency, formatDateTime } from '../api';
import type { AiPlanId, PlatformConfig, UserProfile } from '../types';
import {
  calculatePredictionPrice,
  formatRemainingDuration,
  getAiSubscriptionPlans,
  isFeatureUnlocked,
  type PredictionFeature,
} from '../utils/wingo';

interface PredictionUnlockModalProps {
  feature: PredictionFeature;
  initialPlanId?: AiPlanId;
  user: UserProfile | null;
  platformConfig?: PlatformConfig | null;
  onClose: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onGoToWallet: (suggestedAmount?: number) => void;
  onRequireAuth?: () => void;
}

export const PredictionUnlockModal: React.FC<PredictionUnlockModalProps> = ({
  feature,
  initialPlanId = 'weekly',
  user,
  platformConfig,
  onClose,
  onUserUpdated,
  onGoToWallet,
  onRequireAuth,
}) => {
  const aiPlans = useMemo(
    () => getAiSubscriptionPlans(platformConfig || undefined),
    [platformConfig]
  );
  const [selectedPlanId, setSelectedPlanId] = useState<AiPlanId>(initialPlanId);

  const baseHours =
    feature === 'number'
      ? Math.max(1, Math.round(platformConfig?.numberPredHours ?? 24))
      : Math.max(1, Math.round(platformConfig?.colorPredHours ?? 48));
  const basePrice =
    feature === 'number'
      ? Math.max(0, Number(platformConfig?.numberPredPrice ?? 20))
      : Math.max(0, Number(platformConfig?.colorPredPrice ?? 10));
  const minHours = Math.max(1, Math.round(platformConfig?.minUnlockHours ?? 1));
  const maxHours = Math.max(minHours, Math.round(platformConfig?.maxUnlockHours ?? 720));
  const featureDisabled =
    feature === 'ai'
      ? platformConfig?.aiPredEnabled === false
      : feature === 'number'
      ? platformConfig?.numberPredEnabled === false
      : platformConfig?.colorPredEnabled === false;

  const presetHoursList = useMemo(() => {
    const raw = [6, 12, 24, 48, 72, 168];
    if (!raw.includes(baseHours)) {
      raw.push(baseHours);
    }
    return Array.from(new Set(raw))
      .filter((h) => h >= minHours && h <= maxHours)
      .sort((a, b) => a - b)
      .slice(0, 6);
  }, [baseHours, minHours, maxHours]);

  const [hoursInput, setHoursInput] = useState<string>(String(baseHours));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState<{
    title: string;
    planLabel: string;
    chargedAmount: number;
    expiresAt: string;
    feature: PredictionFeature;
  } | null>(null);

  const fireCelebrationConfetti = (isAi: boolean) => {
    try {
      const colors = isAi
        ? ['#a855f7', '#3b82f6', '#10b981', '#ec4899', '#fbbf24']
        : ['#10b981', '#3b82f6', '#fbbf24'];
      void confetti({
        particleCount: isAi ? 95 : 55,
        spread: isAi ? 82 : 65,
        origin: { y: 0.6 },
        colors,
      });
      if (isAi) {
        window.setTimeout(() => {
          void confetti({
            particleCount: 55,
            angle: 60,
            spread: 58,
            origin: { x: 0.12, y: 0.62 },
            colors,
          });
          void confetti({
            particleCount: 55,
            angle: 120,
            spread: 58,
            origin: { x: 0.88, y: 0.62 },
            colors,
          });
        }, 220);
      }
    } catch {
      // ignore confetti canvas fallback
    }
  };

  const parsedHours = useMemo(() => {
    const n = Math.round(Number(hoursInput));
    if (!Number.isFinite(n)) return 0;
    return n;
  }, [hoursInput]);

  const selectedAiPlan = useMemo(
    () => aiPlans.find((p) => p.id === selectedPlanId) || aiPlans[0],
    [aiPlans, selectedPlanId]
  );

  const validHours =
    feature === 'ai' ? true : parsedHours >= minHours && parsedHours <= maxHours;

  const cost = useMemo(() => {
    if (feature === 'ai') return selectedAiPlan.price;
    return validHours
      ? calculatePredictionPrice(feature, parsedHours, platformConfig || undefined)
      : 0;
  }, [feature, selectedAiPlan, parsedHours, validHours, platformConfig]);

  const featureTitle =
    feature === 'ai'
      ? 'Gemini AI Live Predictor'
      : feature === 'number'
      ? 'Number Prediction (0–9)'
      : 'Color Prediction';
  const currentExpiry =
    feature === 'ai'
      ? user?.aiPredExpiresAt
      : feature === 'number'
      ? user?.numberPredExpiresAt
      : user?.colorPredExpiresAt;
  const alreadyActive = isFeatureUnlocked(currentExpiry);
  const walletBalance = user?.walletBalance ?? 0;
  const lacksBalance = Boolean(user) && validHours && walletBalance < cost;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth?.();
      return;
    }
    if (featureDisabled) {
      setError('This prediction pass is temporarily paused by the administrator.');
      return;
    }
    if (!validHours) {
      setError(`Enter custom hours between ${minHours} and ${maxHours}.`);
      return;
    }

    setError(null);
    setInsufficientFunds(false);
    setSubmitting(true);

    try {
      const payload =
        feature === 'ai'
          ? { feature: 'ai', planId: selectedAiPlan.id }
          : { feature, hours: parsedHours };
      const res = await apiRequest<{
        user: UserProfile;
        chargedAmount: number;
        expiresAt: string;
      }>('/api/predictions/unlock', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onUserUpdated(res.user);
      fireCelebrationConfetti(feature === 'ai');
      setPurchaseSuccess({
        title: featureTitle,
        planLabel:
          feature === 'ai'
            ? `${selectedAiPlan.label} (${selectedAiPlan.durationLabel})`
            : `${parsedHours} Hours Access`,
        chargedAmount: res.chargedAmount ?? cost,
        expiresAt: res.expiresAt,
        feature,
      });
    } catch (err) {
      if (err instanceof ApiError && err.data?.insufficientFunds) {
        setInsufficientFunds(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to unlock prediction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (purchaseSuccess) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
        <div className="animate-modal-pop w-full max-w-md studio-card rounded-2xl overflow-hidden shadow-2xl border border-emerald-400/35">
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-purple-500 via-blue-500 to-emerald-400 text-white shadow-lg shadow-purple-500/30">
              <PartyPopper className="w-8 h-8" />
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                Congratulations! Pass Activated
              </div>
              <h2 className="text-2xl font-extrabold mt-1">{purchaseSuccess.title}</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {purchaseSuccess.feature === 'ai'
                  ? 'You can now toggle "Active Gemini AI" inside any Game Mod Menu for autonomous 3-strategy Gemini AI analysis & live history tracking!'
                  : 'Your prediction pass is live and permanently saved to your account.'}
              </p>
            </div>

            <div className="ink-card rounded-xl p-4 text-left text-white space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Plan Activated</span>
                <span className="font-bold text-emerald-300">{purchaseSuccess.planLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Coins Deducted</span>
                <span className="font-mono font-bold text-amber-300">
                  {formatCurrency(purchaseSuccess.chargedAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Valid Until</span>
                <span className="font-mono font-semibold text-cyan-300">
                  {formatDateTime(purchaseSuccess.expiresAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Remaining Time</span>
                <span className="font-mono font-bold text-white">
                  {formatRemainingDuration(purchaseSuccess.expiresAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-400 justify-center font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Active Pass & Remaining Balance Saved</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn text-sm font-extrabold cursor-pointer"
            >
              Continue & Use Predictor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-modal-pop w-full max-w-lg studio-card rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-5 border-b studio-divider studio-muted flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-1.5">
              {feature === 'ai' && <Brain className="w-3.5 h-3.5" />}
              {alreadyActive ? 'Extend Access Pass' : 'Unlock Smart Predictor Pass'}
            </div>
            <h2 className="text-lg font-extrabold truncate mt-0.5">{featureTitle}</h2>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
            {alreadyActive ? 'EXTEND' : 'INSTANT'}
          </span>
        </div>

        <form onSubmit={handleUnlock} className="p-6 space-y-5">
          <div className="ink-card rounded-xl text-white p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-400">
                {feature === 'ai' ? 'Selected AI Plan' : 'Standard Plan Rate'}
              </div>
              <div className="text-base font-bold font-mono tabular-nums mt-0.5">
                {feature === 'ai'
                  ? `₹${selectedAiPlan.price} / ${selectedAiPlan.durationLabel}`
                  : `₹${basePrice} / ${baseHours} Hours`}
              </div>
              {alreadyActive && (
                <div className="text-[11px] text-emerald-400 mt-1 font-medium">
                  Active · {formatRemainingDuration(currentExpiry)}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Wallet Coins</div>
              <div
                className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  lacksBalance ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatCurrency(walletBalance)}
              </div>
            </div>
          </div>

          {feature === 'ai' ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Choose Gemini AI Predictor Plan (unlocks live Gemini AI, autonomous 3-strategy selection &amp; tracked round history):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {aiPlans.map((plan) => {
                  const active = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setError(null);
                        setInsufficientFunds(false);
                      }}
                      className={`press-scale text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/40 studio-card'
                          : 'studio-muted opacity-90 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold">{plan.label}</span>
                        {active ? (
                          <Check className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                        ) : plan.badge ? (
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400">
                            {plan.badge}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-lg font-extrabold font-mono tabular-nums text-[var(--accent-primary)]">
                          {formatCurrency(plan.price)}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                          {plan.durationLabel}
                        </span>
                      </div>
                      {plan.savingsNote && (
                        <div className="mt-1 text-[10px] font-semibold text-emerald-400">
                          {plan.savingsNote}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold mb-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Select Access Duration
                </span>
                <span className="text-[11px] font-mono tabular-nums">
                  {minHours}h – {maxHours}h
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {presetHoursList.map((hrs) => {
                  const presetCost = calculatePredictionPrice(
                    feature,
                    hrs,
                    platformConfig || undefined
                  );
                  const selected = parsedHours === hrs;
                  return (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => {
                        setHoursInput(String(hrs));
                        setError(null);
                        setInsufficientFunds(false);
                      }}
                      className={`py-2.5 px-2 rounded-xl border text-center cursor-pointer transition-all press-scale ${
                        selected
                          ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/30 studio-card'
                          : 'studio-muted'
                      }`}
                    >
                      <div className="text-xs font-bold font-mono tabular-nums">
                        {hrs === baseHours ? `${hrs}h (Std)` : `${hrs}h`}
                      </div>
                      <div className="text-[11px] font-mono font-bold tabular-nums text-[var(--accent-primary)] mt-0.5">
                        ₹{presetCost}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <input
                  type="number"
                  min={minHours}
                  max={maxHours}
                  step={1}
                  value={hoursInput}
                  onChange={(e) => {
                    setHoursInput(e.target.value);
                    setError(null);
                    setInsufficientFunds(false);
                  }}
                  placeholder={`Custom hours (${minHours}–${maxHours})`}
                  className="studio-input w-full px-4 py-3 min-h-[46px] rounded-xl font-mono text-sm tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
                  hours
                </span>
              </div>
            </div>
          )}

          <div className="studio-muted border rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Total Coins Required
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {feature === 'ai'
                  ? `${selectedAiPlan.durationLabel} (${selectedAiPlan.hours}h) full Gemini AI access`
                  : validHours
                  ? `${parsedHours} hours pro-rata`
                  : `Enter valid hours (${minHours}–${maxHours})`}
              </div>
            </div>
            <div className="text-2xl font-extrabold font-mono tabular-nums">
              {validHours ? formatCurrency(cost) : '—'}
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-start gap-2 animate-fade-up">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!user ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequireAuth?.();
              }}
              className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn text-sm font-bold cursor-pointer"
            >
              Sign In to Unlock
            </button>
          ) : featureDisabled ? (
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-center">
              Unlocks for this pass are currently paused by the administrator.
            </div>
          ) : lacksBalance || insufficientFunds ? (
            <div className="space-y-2.5">
              <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                Insufficient wallet coins ({formatCurrency(walletBalance)}). Deposit{' '}
                <strong>{formatCurrency(cost)}</strong> via the Payment Gateway to unlock{' '}
                {featureTitle}.
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToWallet(Math.max(1, Math.ceil(cost)));
                }}
                className="btn-shine press-scale w-full min-h-[48px] rounded-xl bg-[#d97706] hover:bg-[#b45309] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Add {formatCurrency(cost)} via Payment Gateway</span>
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitting || !validHours}
              className="btn-shine press-scale w-full min-h-[48px] rounded-xl accent-btn disabled:opacity-60 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {alreadyActive ? <Sparkles className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>
                {submitting
                  ? 'Unlocking...'
                  : `${alreadyActive ? 'Extend' : 'Unlock'} for ${formatCurrency(cost)}`}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="press-scale w-full min-h-[46px] rounded-xl studio-muted border text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Close
          </button>
        </form>
      </div>
    </div>
  );
};
