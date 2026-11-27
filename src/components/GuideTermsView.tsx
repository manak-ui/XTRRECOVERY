import React, { useState } from 'react';
import {
  BookOpen,
  FileCheck2,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  Brain,
  Gamepad2,
  Wallet,
  AlertTriangle,
  ArrowRight,
  Clock,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateTime,
  getTelegramDisplayHandle,
  normalizeTelegramSupportUrl,
} from '../api';
import type { PlatformConfig, UserProfile } from '../types';

interface GuideTermsViewProps {
  initialTab?: 'guide' | 'terms';
  platformConfig?: PlatformConfig | null;
  user: UserProfile | null;
  termsAcceptedAt: string | null;
  onAcceptTerms: () => void;
  onGoToGames: () => void;
  onGoToAuth: () => void;
  onOpenGateway: () => void;
}

export const TERMS_SECTIONS = [
  {
    number: '01',
    title: 'Account Registration, 2-Account Device Limit & UID Policy',
    body: 'Every player receives one unique Player UID upon registration and a 24-Hour Free Gemini AI Pass on their first account. A maximum of 2 accounts per device is permitted; registering a 3rd account on the same device triggers automatic security suspension. Never share credentials or abuse bonus trials.',
  },
  {
    number: '02',
    title: 'Manual UPI Deposits & UTR Proof Rules',
    body: 'All wallet deposits are submitted through the dedicated UPI Payment Gateway and require an authentic 12-digit UTR / UPI reference number. Coins are never automatically credited; every request enters a Pending state until manually reviewed by the administrator. Submitting fabricated, altered, or reused UTR references will cause immediate rejection and potential account restriction.',
  },
  {
    number: '03',
    title: 'Prediction Passes & Gemini AI Analytics Disclaimer',
    body: 'Color Prediction, Number Prediction (0–9), and Gemini AI Live Predictor passes unlock analytical pattern scanning, historical draw inspection, and Sureshot probability indicators for the purchased duration. Signals are statistical and informational tools only and do not guarantee financial profit. Always follow strict 1–5 level bankroll limits.',
  },
  {
    number: '04',
    title: 'Custom Status Updates & Non-Refundable Pass Usage',
    body: 'Once coins are spent on unlocking a paid game or a timed prediction pass (Color, Number, or Gemini AI plans), the pass activates immediately for the selected window and cannot be reversed. Deposit statuses may show custom administrator notes explaining verification progress.',
  },
  {
    number: '05',
    title: 'Fair Play, Security & Administrative Enforcement',
    body: 'Automated scraping, unauthorized API tampering, abusive behavior, or exploiting embedded arenas is strictly prohibited. The platform administrator reserves the right to restrict, ban, or adjust balances when policy violations or fraudulent transactions are detected.',
  },
];

export const GuideTermsView: React.FC<GuideTermsViewProps> = ({
  initialTab = 'guide',
  platformConfig,
  user,
  termsAcceptedAt,
  onAcceptTerms,
  onGoToGames,
  onGoToAuth,
  onOpenGateway,
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'terms'>(initialTab);
  const [checkedBox, setCheckedBox] = useState(Boolean(termsAcceptedAt));
  const brandName = platformConfig?.brandName || 'KWG Arena';
  const hasAccepted = Boolean(termsAcceptedAt);

  const supportUrl = normalizeTelegramSupportUrl(platformConfig?.supportUrl);
  const supportHandle = getTelegramDisplayHandle(platformConfig?.supportUrl);

  const guideSteps = [
    {
      step: '01',
      icon: ShieldCheck,
      title: 'Create Account & Get 24h Free AI Pass',
      desc: 'Register with your 10-digit phone number, email, username, and password after accepting User Terms. New users automatically get 24h Free Gemini AI Predictor access (max 2 accounts per device).',
    },
    {
      step: '02',
      icon: QrCode,
      title: 'Deposit via UPI Gateway & Top UTR Form',
      desc: 'Tap Deposit QR from anywhere in the app to open the Payment Gateway. Scan the live QR code, pay via any UPI app, and enter your 12-digit UTR directly at the top of the checkout page.',
    },
    {
      step: '03',
      icon: Brain,
      title: 'Toggle Active Gemini AI Inside Mod Menu',
      desc: `AI Pass holders can toggle "Active Gemini AI" ON/OFF anytime inside the game Menu to switch between live Gemini AI (autonomous 3-strategy selection across Pattern Brain, Momentum & Dragon Reversal) and Normal Pattern mode. Plans: 7 Days ₹${platformConfig?.aiWeeklyPrice ?? 101} to Yearly ₹${platformConfig?.aiYearlyPrice ?? 1199}.`,
    },
    {
      step: '04',
      icon: Gamepad2,
      title: 'Play & Use the Floating Mod Menu',
      desc: 'Slide through horizontal game rows (10 games per row), launch any game full-screen, open the Mod Menu, set your 1–5 level split deposit, and record WIN/LOSS outcomes in real time.',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10 space-y-6 animate-view-enter">
      {/* Header Banner */}
      <div className="studio-card rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />
            {brandName} · Player Handbook & Legal Policy
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Platform Guide & User Terms
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Learn how deposits, Gemini AI live predictions, and the Mod Menu work—and review & confirm your User Terms & Conditions agreement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1.5 studio-muted border rounded-xl self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`press-scale px-4 py-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'guide'
                ? 'accent-btn shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Player Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`press-scale px-4 py-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'terms'
                ? 'accent-btn shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            Terms & Conditions
            {hasAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Terms Agreement Status Strip */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-up ${
          hasAccepted
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/35 text-amber-800 dark:text-amber-300'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3 text-xs sm:text-sm">
          {hasAccepted ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5 sm:mt-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5 sm:mt-0" />
          )}
          <div>
            <div className="font-extrabold">
              {hasAccepted
                ? 'Terms & Conditions Agreed'
                : 'User Terms & Conditions Agreement Pending'}
            </div>
            <div className="text-xs opacity-90 mt-0.5">
              {hasAccepted
                ? `Accepted on ${formatDateTime(termsAcceptedAt)}. Your agreement is active across this app.`
                : 'Please review the User Terms & Conditions tab and confirm your agreement below.'}
            </div>
          </div>
        </div>

        {!hasAccepted && (
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className="press-scale min-h-[40px] px-4 rounded-xl accent-btn text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
          >
            Review & Agree
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {activeTab === 'guide' ? (
        <div className="space-y-6 animate-fade-up">
          {/* 4-Step Guide Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {guideSteps.map((item, idx) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.step}
                  className="card-lift studio-card rounded-2xl p-6 space-y-3 animate-fade-up"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-10 h-10 rounded-xl accent-btn flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-mono text-xs font-extrabold text-[var(--text-secondary)]">
                      STEP {item.step}
                    </span>
                  </div>
                  <h2 className="text-base font-extrabold">{item.title}</h2>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    {item.desc}
                  </p>
                </article>
              );
            })}
          </div>

          {/* Mod Menu & Pass Pricing Cheat Sheet */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 studio-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                <SlidersHorizontal className="w-4 h-4" />
                In-Game Mod Menu Workflow
              </div>
              <h3 className="text-lg font-extrabold">
                How to Get Accurate Signals Inside Any Game
              </h3>
              <ul className="space-y-3 text-xs sm:text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono font-bold text-[var(--accent-primary)]">01.</span>
                  <span>
                    Open any game from the horizontal rows and tap the floating <strong className="text-[var(--text-primary)]">VIP MOD</strong> chip.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono font-bold text-[var(--accent-primary)]">02.</span>
                  <span>
                    Enter your playable deposit balance and pick <strong className="text-[var(--text-primary)]">1–5 Level Split</strong> (Gentle, Balanced, or Classic 2x) so losses are recovered systematically.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono font-bold text-[var(--accent-primary)]">03.</span>
                  <span>
                    Watch for <strong className="text-emerald-500">ALL WALLET SURESHOT</strong> alerts when Gemini AI detects multi-signal pattern alignment across live draws.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono font-bold text-[var(--accent-primary)]">04.</span>
                  <span>
                    After each round settles, tap <strong className="text-[var(--text-primary)]">WIN</strong> or <strong className="text-[var(--text-primary)]">LOSS</strong> to log the result permanently in your History tab.
                  </span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-5 ink-card rounded-2xl p-6 text-white flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-400 inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Current Pass Rates
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-2 border-b border-white/10">
                    <span className="text-slate-300">Color Prediction</span>
                    <span className="font-bold text-emerald-400">
                      {formatCurrency(platformConfig?.colorPredPrice ?? 10)} / {platformConfig?.colorPredHours ?? 48}h
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/10">
                    <span className="text-slate-300">Number Prediction (0–9)</span>
                    <span className="font-bold text-amber-300">
                      {formatCurrency(platformConfig?.numberPredPrice ?? 20)} / {platformConfig?.numberPredHours ?? 24}h
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/10">
                    <span className="text-slate-300">Gemini AI · 7 Days / 15 Days</span>
                    <span className="font-bold text-cyan-300">
                      ₹{platformConfig?.aiWeeklyPrice ?? 101} / ₹{platformConfig?.ai15DaysPrice ?? 250}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Gemini AI · Monthly / Yearly</span>
                    <span className="font-bold text-cyan-300">
                      ₹{platformConfig?.aiMonthlyPrice ?? 499} / ₹{platformConfig?.aiYearlyPrice ?? 1199}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={user ? onOpenGateway : onGoToAuth}
                  className="btn-shine press-scale flex-1 min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  {user ? 'Open Payment Gateway' : 'Sign In / Register'}
                </button>
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press-scale min-h-[44px] px-4 rounded-xl bg-sky-500/20 border border-sky-400/35 hover:bg-sky-500/30 text-sky-200 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {supportHandle}
                </a>
                <button
                  type="button"
                  onClick={onGoToGames}
                  className="press-scale min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                >
                  Browse Games
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-up">
          <div className="studio-card rounded-2xl divide-y studio-divider overflow-hidden">
            {TERMS_SECTIONS.map((sec, idx) => (
              <div
                key={sec.number}
                className="p-6 sm:p-7 space-y-2 studio-row-hover transition-colors animate-fade-up"
                style={{ animationDelay: `${idx * 45}ms` }}
              >
                <div className="text-xs font-mono font-bold text-[var(--accent-primary)]">
                  SECTION {sec.number}
                </div>
                <h2 className="text-base sm:text-lg font-extrabold">{sec.title}</h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {sec.body}
                </p>
              </div>
            ))}
          </div>

          {/* Interactive Agreement Box */}
          <div className="studio-card rounded-2xl p-6 sm:p-7 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkedBox}
                onChange={(e) => setCheckedBox(e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer shrink-0"
              />
              <span className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed">
                I confirm that I have read, understood, and agree to abide by the{' '}
                <strong>{brandName} User Terms & Conditions</strong>, manual UPI UTR verification rules, and responsible analytics guidelines.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t studio-divider">
              <div className="text-xs font-mono text-[var(--text-secondary)]">
                {hasAccepted
                  ? `Status: Agreed (${formatDateTime(termsAcceptedAt)})`
                  : 'Status: Action Required'}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={!checkedBox}
                  onClick={() => {
                    onAcceptTerms();
                  }}
                  className="btn-shine press-scale min-h-[44px] px-5 rounded-xl accent-btn disabled:opacity-45 text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {hasAccepted ? 'Agreement Active' : 'I Agree & Accept Terms'}
                </button>
                <button
                  type="button"
                  onClick={onGoToGames}
                  className="press-scale min-h-[44px] px-4 rounded-xl studio-muted border text-xs font-bold cursor-pointer"
                >
                  Back to Games
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
