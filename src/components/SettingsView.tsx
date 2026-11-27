import React, { useEffect, useState } from 'react';
import {
  LogOut,
  UserCheck,
  Wallet,
  Clock,
  Palette,
  Hash,
  ExternalLink,
  Brain,
  Sun,
  Moon,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getTelegramDisplayHandle,
  normalizeTelegramSupportUrl,
} from '../api';
import type { AiPlanId, AppTheme, PlatformConfig, UserProfile } from '../types';
import {
  formatRemainingDuration,
  getAiSubscriptionPlans,
  isFeatureUnlocked,
  isUserAiPassUnlocked,
  type PredictionFeature,
} from '../utils/wingo';
import { PredictionUnlockModal } from './PredictionUnlockModal';
import { AiPassBadge } from './AiPassBadge';

interface SettingsViewProps {
  user: UserProfile;
  platformConfig?: PlatformConfig | null;
  appTheme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  onUserUpdated: (user: UserProfile) => void;
  onOpenGateway: (amount?: number) => void;
  onLogout: () => void;
}

const THEME_OPTIONS: Array<{
  id: AppTheme;
  label: string;
  desc: string;
  swatchClass: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'light',
    label: 'Porcelain Light',
    desc: 'Crisp warm paper & cobalt accent',
    swatchClass: 'bg-[#f6f5f1] border-[#1d4ed8] text-[#0f1115]',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Obsidian Dark',
    desc: 'Low-glare slate surface for night play',
    swatchClass: 'bg-[#090b10] border-blue-500 text-white',
    icon: Moon,
  },
  {
    id: 'neon',
    label: 'Spectrum Neon',
    desc: 'Jai Club violet, cyan & emerald glow',
    swatchClass: 'bg-[#070412] border-[#a855f7] text-[#38bdf8]',
    icon: Sparkles,
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  platformConfig,
  appTheme,
  onThemeChange,
  onUserUpdated,
  onOpenGateway,
  onLogout,
}) => {
  const [unlockFeature, setUnlockFeature] = useState<PredictionFeature | null>(null);
  const [selectedAiPlanId, setSelectedAiPlanId] = useState<AiPlanId>('weekly');
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const aiActive = isUserAiPassUnlocked(user, nowTick);
  const numberActive = isFeatureUnlocked(user.numberPredExpiresAt, nowTick);
  const colorActive = isFeatureUnlocked(user.colorPredExpiresAt, nowTick);
  const supportUrl = normalizeTelegramSupportUrl(platformConfig?.supportUrl);
  const supportHandle = getTelegramDisplayHandle(platformConfig?.supportUrl);
  const aiPlans = getAiSubscriptionPlans(platformConfig || undefined);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 lg:py-10 space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Account & Workspace Settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Switch display mode, manage your Gemini AI & prediction passes, or review credentials.
        </p>
      </div>

      {/* 1. Theme Selector (Light / Dark / Neon) */}
      <section className="studio-card rounded-2xl p-6 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between gap-2 pb-3 border-b studio-divider">
          <div>
            <h2 className="text-sm font-extrabold">Display Mode</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Choose Light, Dark, or Neon styling across the app.
            </p>
          </div>
          <span className="text-xs font-mono uppercase text-[var(--accent-primary)] font-bold">
            {appTheme}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((t) => {
            const Icon = t.icon;
            const selected = appTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onThemeChange(t.id)}
                className={`press-scale text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  selected
                    ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/40 studio-card'
                    : 'studio-muted opacity-90 hover:opacity-100'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 ${t.swatchClass}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-extrabold">{t.label}</span>
                    {selected && <Check className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Gemini AI Predictor Subscription Plans */}
      <section
        className="studio-card rounded-2xl p-6 space-y-5 animate-fade-up"
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b studio-divider">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Brain className="w-4 h-4" />
                Gemini AI Live Predictor Pass
              </span>
              <AiPassBadge active={aiActive} size="xs" />
            </div>
            <h2 className="text-lg font-extrabold mt-0.5">
              {aiActive
                ? user.isAdmin
                  ? 'Admin AI Override Active'
                  : `Gemini AI Active · ${formatRemainingDuration(user.aiPredExpiresAt, nowTick)}`
                : 'AI PASS Not Active — Unlock Autonomous 3-Strategy Gemini AI'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              <strong>AI PASS Exclusive:</strong> Unlocks autonomous 3-strategy evaluation (Pattern Brain AI + Momentum Trend + Dragon Contrarian) with live walk-forward accuracy weights &amp; full prediction history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedAiPlanId('weekly');
              setUnlockFeature('ai');
            }}
            className="btn-shine press-scale min-h-[44px] px-5 rounded-xl accent-btn text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Brain className="w-4 h-4" />
            {aiActive ? 'Extend AI Pass' : 'Activate AI PASS'}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {aiPlans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                setSelectedAiPlanId(plan.id);
                setUnlockFeature('ai');
              }}
              className="card-lift press-scale studio-muted border rounded-xl p-4 text-left cursor-pointer"
            >
              <div className="flex items-center justify-between gap-1 text-xs font-bold text-[var(--text-secondary)]">
                <span>{plan.durationLabel}</span>
                {plan.badge && (
                  <span className="text-[9px] font-extrabold text-emerald-400">{plan.badge}</span>
                )}
              </div>
              <div className="text-xl font-extrabold font-mono tabular-nums text-[var(--accent-primary)] mt-1">
                {formatCurrency(plan.price)}
              </div>
              <div className="text-xs font-semibold mt-1">{plan.label}</div>
              {plan.savingsNote && (
                <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                  {plan.savingsNote}
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Number & Color Prediction Passes */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-up"
        style={{ animationDelay: '90ms' }}
      >
        <div className="card-lift studio-card rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <Hash className="w-4 h-4 text-[#d97706]" />
              Number Prediction (0–9)
            </div>
            <div className="text-sm font-extrabold">
              {numberActive ? 'Unlocked & Active' : 'Currently Locked'}
            </div>
            <div className="text-xs text-[var(--text-secondary)] inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[#d97706]" />
              {numberActive
                ? formatRemainingDuration(user.numberPredExpiresAt)
                : `₹${platformConfig?.numberPredPrice ?? 20} / ${platformConfig?.numberPredHours ?? 24}h`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUnlockFeature('number')}
            className={`press-scale min-h-[38px] px-3.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
              numberActive
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'accent-btn'
            }`}
          >
            {numberActive ? 'Extend' : 'Unlock'}
          </button>
        </div>

        <div className="card-lift studio-card rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <Palette className="w-4 h-4 text-[var(--accent-primary)]" />
              Color Prediction Pass
            </div>
            <div className="text-sm font-extrabold">
              {colorActive ? 'Unlocked & Active' : 'Currently Locked'}
            </div>
            <div className="text-xs text-[var(--text-secondary)] inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {colorActive
                ? formatRemainingDuration(user.colorPredExpiresAt)
                : `₹${platformConfig?.colorPredPrice ?? 10} / ${platformConfig?.colorPredHours ?? 48}h`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUnlockFeature('color')}
            className={`press-scale min-h-[38px] px-3.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
              colorActive
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'accent-btn'
            }`}
          >
            {colorActive ? 'Extend' : 'Unlock'}
          </button>
        </div>
      </div>

      {/* 4. Player Profile Sheet */}
      <div
        className="studio-card rounded-2xl p-6 sm:p-8 space-y-6 animate-fade-up"
        style={{ animationDelay: '130ms' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b studio-divider">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl ink-btn font-extrabold text-lg flex items-center justify-center shrink-0">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-extrabold inline-flex items-center gap-2 flex-wrap">
                <span>{user.username}</span>
                <AiPassBadge active={aiActive} size="sm" />
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono tabular-nums">
                UID {user.uid} · Registered {formatDateTime(user.createdAt)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="press-scale min-h-[44px] px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-sm font-bold text-rose-600 dark:text-rose-300 inline-flex items-center gap-2 self-start cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">Phone Number</div>
            <div className="font-mono font-bold mt-1">{user.phone}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">Email Address</div>
            <div className="font-semibold mt-1 break-all">{user.email}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">Wallet Balance</div>
            <div className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 inline-flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />
              {formatCurrency(user.walletBalance)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">Account Status</div>
            <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 inline-flex items-center gap-1.5 capitalize">
              <UserCheck className="w-4 h-4" />
              {user.status}
            </div>
          </div>
        </div>

        {/* Profile AI Pass Verification Strip */}
        <div
          className={`rounded-xl p-4 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            aiActive
              ? 'bg-emerald-500/10 border-emerald-500/35'
              : 'bg-purple-500/10 border-purple-500/30'
          }`}
        >
          <div className="space-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Profile AI Pass Status
              </span>
              <AiPassBadge active={aiActive} size="xs" />
            </div>
            <div className="text-sm font-extrabold">
              {user.isAdmin
                ? 'Active · Admin Unlimited AI Pass'
                : aiActive
                ? `Active · ${formatRemainingDuration(user.aiPredExpiresAt, nowTick)}`
                : 'Not Active (AI PASS Required for Gemini AI)'}
            </div>
            {user.aiPredExpiresAt && !user.isAdmin && (
              <div className="text-xs font-mono text-[var(--text-secondary)]">
                {aiActive
                  ? `Expires on ${formatDateTime(user.aiPredExpiresAt)}`
                  : `Previous pass expired on ${formatDateTime(user.aiPredExpiresAt)}`}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setUnlockFeature('ai')}
            className="btn-shine press-scale min-h-[42px] px-4 rounded-xl accent-btn text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Brain className="w-4 h-4" />
            {aiActive ? 'Extend AI Pass' : 'Get Gemini AI Pass'}
          </button>
        </div>
      </div>

      <div
        className="studio-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 animate-fade-up"
        style={{ animationDelay: '160ms' }}
      >
        <div>
          <div className="text-sm font-extrabold">Telegram Support Channel ({supportHandle})</div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            Need help with deposits, AI passes, or account access? Reach out directly on Telegram.
          </div>
        </div>
        <a
          href={supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="press-scale min-h-[44px] px-5 rounded-xl accent-btn text-xs font-bold inline-flex items-center gap-2 shrink-0"
        >
          Open {supportHandle}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {unlockFeature && (
        <PredictionUnlockModal
          feature={unlockFeature}
          initialPlanId={selectedAiPlanId}
          user={user}
          platformConfig={platformConfig}
          onClose={() => setUnlockFeature(null)}
          onUserUpdated={onUserUpdated}
          onGoToWallet={(amt) => {
            setUnlockFeature(null);
            onOpenGateway(amt);
          }}
        />
      )}
    </div>
  );
};
