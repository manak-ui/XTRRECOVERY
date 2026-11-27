import React, { useEffect, useState } from 'react';
import {
  Lock,
  Phone,
  Mail,
  User,
  ShieldAlert,
  ArrowLeft,
  Gift,
  Eye,
  EyeOff,
  CheckCircle2,
  BookOpen,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  QrCode,
  Brain,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import {
  ApiError,
  apiRequest,
  formatCurrency,
  formatDateTime,
  getTelegramDisplayHandle,
  normalizeTelegramSupportUrl,
  setAuthToken,
} from '../api';
import type { BanInfo, PlatformConfig, UserProfile } from '../types';
import { TERMS_SECTIONS } from './GuideTermsView';

const SAVED_CREDS_STORAGE_KEY = 'kwg_saved_login_creds';

function readSavedLoginCreds(): { phone: string; password: string } | null {
  try {
    const raw = localStorage.getItem(SAVED_CREDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { phone?: string; password?: string };
    if (typeof parsed?.phone === 'string' && typeof parsed?.password === 'string' && parsed.phone) {
      return { phone: parsed.phone, password: parsed.password };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeSavedLoginCreds(phone: string, password: string): void {
  try {
    localStorage.setItem(SAVED_CREDS_STORAGE_KEY, JSON.stringify({ phone, password }));
  } catch {
    // ignore
  }
}

function clearSavedLoginCreds(): void {
  try {
    localStorage.removeItem(SAVED_CREDS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface AuthViewProps {
  initialMode?: 'login' | 'register';
  platformConfig?: PlatformConfig | null;
  banBanner: BanInfo | null;
  onClearBanBanner: () => void;
  onAuthenticated: (user: UserProfile) => void;
  onTermsAccepted: () => void;
  onOpenGuideTerms: (tab: 'guide' | 'terms') => void;
  onBackToGames: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode = 'login',
  platformConfig,
  banBanner,
  onClearBanBanner,
  onAuthenticated,
  onTermsAccepted,
  onOpenGuideTerms,
  onBackToGames,
}) => {
  const initialSaved = readSavedLoginCreds();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [phone, setPhone] = useState(initialSaved?.phone || '');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(initialSaved?.password || '');
  const [rememberCreds, setRememberCreds] = useState(Boolean(initialSaved));
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showInlineTerms, setShowInlineTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localBan, setLocalBan] = useState<BanInfo | null>(banBanner);

  useEffect(() => {
    if (banBanner) {
      setLocalBan(banBanner);
    }
  }, [banBanner]);

  const activeBan = localBan || banBanner;
  const brandName = platformConfig?.brandName || 'KWG Arena';
  const welcomeBonus = Number(platformConfig?.welcomeBonus || 0);
  const registrationsOpen = platformConfig?.registrationsEnabled !== false;
  const telegramUrl = normalizeTelegramSupportUrl(platformConfig?.supportUrl);
  const telegramHandle = getTelegramDisplayHandle(platformConfig?.supportUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLocalBan(null);
    onClearBanBanner();

    if (mode === 'register' && !acceptedTerms) {
      setError('You must read and agree to the User Terms & Conditions before creating an account.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        });
        if (rememberCreds) {
          writeSavedLoginCreds(phone.trim(), password);
        } else {
          clearSavedLoginCreds();
        }
        setAuthToken(res.token);
        onAuthenticated(res.user);
      } else {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            phone,
            email,
            username,
            password,
            acceptedTerms: true,
          }),
        });
        if (rememberCreds) {
          writeSavedLoginCreds(phone.trim(), password);
        }
        onTermsAccepted();
        setAuthToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err) {
      if (err instanceof ApiError && err.data?.banned) {
        setLocalBan({
          banReason: String(err.data.banReason || 'Account Suspended'),
          banNotice: String(
            err.data.banNotice || 'Your account has been suspended by an administrator.'
          ),
          bannedAt: (err.data.bannedAt as string) || null,
          banExpiresAt: (err.data.banExpiresAt as string) || null,
        });
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-12 animate-view-enter">
      {/* Top Quick Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button
          type="button"
          onClick={onBackToGames}
          className="press-scale min-h-[42px] px-4 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Games
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="press-scale min-h-[40px] px-3.5 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Support {telegramHandle}
          </a>
          <button
            type="button"
            onClick={() => onOpenGuideTerms('guide')}
            className="press-scale min-h-[40px] px-3.5 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            Platform Guide
          </button>
          <button
            type="button"
            onClick={() => onOpenGuideTerms('terms')}
            className="press-scale min-h-[40px] px-3.5 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            Terms & Conditions
          </button>
        </div>
      </div>

      {/* Main Split Card (Auth Form Left, Interactive Highlights Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Form Panel */}
        <div className="lg:col-span-7 studio-card rounded-2xl p-6 sm:p-8 lg:p-10 flex flex-col justify-between animate-fade-up">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b studio-divider">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  {brandName} · Player Gateway
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                  {mode === 'login' ? 'Welcome Back' : 'Create Player Account'}
                </h1>
              </div>

              <div className="inline-flex p-1 studio-muted border rounded-xl self-start">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`press-scale px-4 py-2 text-xs font-bold rounded-lg transition-all min-h-[40px] whitespace-nowrap cursor-pointer ${
                    mode === 'login'
                      ? 'accent-btn shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`press-scale px-4 py-2 text-xs font-bold rounded-lg transition-all min-h-[40px] whitespace-nowrap cursor-pointer ${
                    mode === 'register'
                      ? 'accent-btn shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            </div>

            {activeBan && (
              <div className="mt-5 border border-rose-500/40 bg-rose-500/15 rounded-xl p-4 animate-modal-pop">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <div className="text-sm font-extrabold text-rose-500 dark:text-rose-300">
                      Account Suspended · {activeBan.banReason}
                    </div>
                    <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-200 leading-relaxed">
                      {activeBan.banNotice}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-rose-500 dark:text-rose-300">
                      {activeBan.bannedAt && (
                        <span>Banned on {formatDateTime(activeBan.bannedAt)}</span>
                      )}
                      <span>
                        {activeBan.banExpiresAt
                          ? `Suspended until ${formatDateTime(activeBan.banExpiresAt)}`
                          : 'Permanent Suspension'}
                      </span>
                    </div>
                    <div className="pt-1">
                      <a
                        href={telegramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Appeal or Contact Support ({telegramHandle})
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mode === 'register' && !registrationsOpen && (
              <div className="mt-5 border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs sm:text-sm rounded-xl px-4 py-3">
                New registrations are currently paused by the administrator. Existing players can still sign in.
              </div>
            )}

            {error && (
              <div className="mt-5 border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs sm:text-sm rounded-xl px-4 py-3 animate-fade-up">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-up">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Display Username
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. AcePlayer"
                        className="studio-input w-full pl-10 pr-4 py-2.5 min-h-[48px] rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="studio-input w-full pl-10 pr-4 py-2.5 min-h-[48px] rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter 10-digit mobile number"
                    className="studio-input w-full pl-10 pr-4 py-2.5 min-h-[48px] rounded-xl text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="studio-input w-full pl-10 pr-12 py-2.5 min-h-[48px] rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-xs font-semibold text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={rememberCreds}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setRememberCreds(next);
                      if (next) {
                        if (phone.trim() && password) {
                          writeSavedLoginCreds(phone.trim(), password);
                        }
                      } else {
                        clearSavedLoginCreds();
                      }
                    }}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <span>Remember ID &amp; Password</span>
                </label>

                {rememberCreds && (phone || password) && (
                  <button
                    type="button"
                    onClick={() => {
                      setRememberCreds(false);
                      clearSavedLoginCreds();
                      setPhone('');
                      setPassword('');
                    }}
                    className="text-[11px] font-bold text-rose-400 hover:underline cursor-pointer"
                  >
                    Clear Saved Login
                  </button>
                )}
              </div>

              {mode === 'register' && (
                <div className="studio-muted border rounded-xl p-4 space-y-3 animate-fade-up">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => {
                        setAcceptedTerms(e.target.checked);
                        if (e.target.checked) setError(null);
                      }}
                      className="mt-0.5 w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-[var(--text-primary)] leading-relaxed">
                      I agree to the{' '}
                      <strong className="text-[var(--accent-primary)]">
                        User Terms & Conditions
                      </strong>{' '}
                      (manual UPI verification rules, no fake UTR submissions, and informational analytics terms).
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3 pl-7 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setShowInlineTerms((prev) => !prev)}
                      className="font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                    >
                      {showInlineTerms ? 'Hide Quick Terms' : 'Preview Terms Here'}
                    </button>
                    <span className="text-[var(--text-secondary)]">·</span>
                    <button
                      type="button"
                      onClick={() => onOpenGuideTerms('terms')}
                      className="font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer"
                    >
                      Open Full Guide & Terms Page
                    </button>
                  </div>

                  {showInlineTerms && (
                    <div className="mt-2 pt-3 border-t studio-divider space-y-2 max-h-44 overflow-y-auto pr-1 text-[11px] text-[var(--text-secondary)]">
                      {TERMS_SECTIONS.map((s) => (
                        <div key={s.number}>
                          <strong className="text-[var(--text-primary)]">
                            {s.number}. {s.title}:
                          </strong>{' '}
                          {s.body}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (mode === 'register' && !registrationsOpen)}
                className="btn-shine press-scale w-full mt-2 accent-btn disabled:opacity-50 font-bold text-sm rounded-xl py-3 px-5 min-h-[50px] transition-all cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {mode === 'register' && acceptedTerms && <CheckCircle2 className="w-4 h-4" />}
                <span>
                  {loading
                    ? 'Authenticating...'
                    : mode === 'login'
                    ? 'Sign In to Arena'
                    : 'Create Account & Agree to Terms'}
                </span>
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t studio-divider flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span>
              {mode === 'login' ? 'New to KWG Arena?' : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              {mode === 'login' ? 'Create Account & Get UID →' : 'Sign In Instead →'}
            </button>
          </div>
        </div>

        {/* Right: Feature Showcase Panel */}
        <div
          className="lg:col-span-5 ink-card rounded-2xl p-6 sm:p-8 lg:p-10 text-white flex flex-col justify-between gap-6 animate-fade-up"
          style={{ animationDelay: '70ms' }}
        >
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <Sparkles className="w-4 h-4" />
              Inside {brandName}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-balance">
              {platformConfig?.tagline ||
                'Horizontal 10-Game Rows, Animated Mod Overlay & Gemini AI Signals'}
            </h2>

            <div className="rounded-xl bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-emerald-500/20 border border-purple-400/35 p-4 flex items-start gap-3 text-xs text-white">
              <Brain className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-emerald-300">
                  24h Free AI Trial · VIP AI Plans From ₹{platformConfig?.aiWeeklyPrice ?? 101}
                </div>
                <div className="text-[11px] text-slate-200 mt-0.5 leading-relaxed">
                  New accounts unlock 24h free Gemini AI with Autonomous <strong>3-Strategy Fusion</strong> &amp; live prediction history. Plans: 7d ₹{platformConfig?.aiWeeklyPrice ?? 101} · 15d ₹{platformConfig?.ai15DaysPrice ?? 250} · 30d ₹{platformConfig?.aiMonthlyPrice ?? 499} · 1y ₹{platformConfig?.aiYearlyPrice ?? 1199}.
                </div>
              </div>
            </div>

            {welcomeBonus > 0 && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/35 p-4 flex items-center gap-3 text-xs text-emerald-100">
                <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  New accounts receive a{' '}
                  <strong className="font-mono text-white">{formatCurrency(welcomeBonus)}</strong>{' '}
                  welcome bonus on sign up.
                </div>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                <QrCode className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-extrabold text-white">
                    Fast UPI Gateway · Top UTR Entry
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    Generate dynamic UPI QR codes and enter your UTR right at the top for manual admin verification.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-extrabold text-white">
                    Fair Device Policy (Max 2 Accounts / Device)
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    Up to 2 accounts are allowed per device to keep AI trials &amp; bonuses fair.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Telegram Support ({telegramHandle})
            </a>
            <button
              type="button"
              onClick={() => onOpenGuideTerms('guide')}
              className="font-bold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              View Guide & Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
