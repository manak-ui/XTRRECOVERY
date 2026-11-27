import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gamepad2,
  Wallet,
  History,
  Settings,
  Shield,
  Play,
  Lock,
  Megaphone,
  AlertTriangle,
  ArrowUpRight,
  Sun,
  Moon,
  Sparkles,
  QrCode,
  Brain,
  Clock,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  LogOut,
  User,
  ChevronDown,
} from 'lucide-react';
import {
  apiRequest,
  formatCurrency,
  formatDateTime,
  getTelegramDisplayHandle,
  normalizeTelegramSupportUrl,
  setAuthToken,
  setOnBannedHandler,
} from './api';
import type {
  AiPlanId,
  AppTheme,
  BanInfo,
  GameSummary,
  PlatformConfig,
  UserProfile,
} from './types';
import { AuthView } from './components/AuthView';
import { GamePlayModal } from './components/GamePlayModal';
import { WalletView } from './components/WalletView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { AdminPanel } from './components/AdminPanel';
import { PaymentGatewayPage } from './components/PaymentGatewayPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PredictionUnlockModal } from './components/PredictionUnlockModal';
import { AiPassComparisonModal } from './components/AiPassComparisonModal';
import { AiPassBadge } from './components/AiPassBadge';
import { GuideTermsView } from './components/GuideTermsView';
import {
  fetchPartnerWingoResults,
  formatRemainingDuration,
  getAiSubscriptionPlans,
  getWingo1MinClock,
  isUserAiPassUnlocked,
  PARTNER_WINGO_SLUGS,
  type PartnerWingoResultItem,
} from './utils/wingo';

type PageView =
  | 'games'
  | 'wallet'
  | 'payment-gateway'
  | 'history'
  | 'settings'
  | 'guide'
  | 'admin'
  | 'auth';
type GameFilter = 'all' | 'wingo' | 'embed' | 'source';

const THEME_STORAGE_KEY = 'kwg_app_theme';
const TERMS_STORAGE_KEY = 'kwg_terms_accepted_at';

function getStoredTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'neon' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'neon';
}

function getStoredTermsAcceptedAt(): string | null {
  try {
    return localStorage.getItem(TERMS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [appTheme, setAppTheme] = useState<AppTheme>(getStoredTheme);
  const [view, setView] = useState<PageView>('games');
  const [guideInitialTab, setGuideInitialTab] = useState<'guide' | 'terms'>('guide');
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(getStoredTermsAcceptedAt);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [banBanner, setBanBanner] = useState<BanInfo | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [activeGame, setActiveGame] = useState<GameSummary | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [recentWingoResults, setRecentWingoResults] = useState<PartnerWingoResultItem[]>([]);
  const [gatewayAmount, setGatewayAmount] = useState<number | null>(null);
  const [gatewayReturnView, setGatewayReturnView] = useState<PageView>('wallet');
  const [showAiUpgradeModal, setShowAiUpgradeModal] = useState(false);
  const [aiUpgradePlanId, setAiUpgradePlanId] = useState<AiPlanId>('weekly');
  const [showAiHubModal, setShowAiHubModal] = useState(false);
  const [showAutoDiffPopup, setShowAutoDiffPopup] = useState(false);
  const autoPopupTriggeredRef = useRef(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [wingoTicker, setWingoTicker] = useState(() => getWingo1MinClock('kwg-game'));
  const rowScrollRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', appTheme);
    root.classList.toggle('dark', appTheme !== 'light');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, appTheme);
    } catch {
      // ignore
    }
  }, [appTheme]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setWingoTicker(getWingo1MinClock('kwg-game'));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [userMenuOpen]);

  const loadPlatformConfig = useCallback(async () => {
    try {
      const res = await apiRequest<{ config: PlatformConfig }>('/api/platform/config');
      if (res?.config) {
        setPlatformConfig(res.config);
      }
    } catch {
      // keep existing config
    }
  }, []);

  useEffect(() => {
    void loadPlatformConfig();
  }, [loadPlatformConfig]);

  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await apiRequest<{ games: GameSummary[] }>('/api/games');
      setGames(res.games);
    } catch {
      // keep current state
    } finally {
      setGamesLoading(false);
    }
  }, []);

  const refreshRecentWingoResults = useCallback(async () => {
    try {
      const list = await fetchPartnerWingoResults();
      if (list.length > 0) {
        setRecentWingoResults(list);
      }
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    setOnBannedHandler((info) => {
      setAuthToken(null);
      setUser(null);
      setActiveGame(null);
      setBanBanner(info);
      setView('auth');
    });
    return () => setOnBannedHandler(null);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/me');
      if (res.user) {
        setUser(res.user);
      }
    } catch {
      // ignore if guest or banned (ban handler runs automatically on 403)
    }
  }, []);

  useEffect(() => {
    void refreshCurrentUser();
  }, [refreshCurrentUser]);

  useEffect(() => {
    const onFocus = () => {
      if (user) {
        void refreshCurrentUser();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, refreshCurrentUser]);

  useEffect(() => {
    if (user && (view === 'games' || view === 'wallet' || view === 'settings' || view === 'admin')) {
      void refreshCurrentUser();
    }
  }, [view]);

  useEffect(() => {
    void loadGames();
  }, [loadGames, user?.id]);

  useEffect(() => {
    void refreshRecentWingoResults();
  }, [refreshRecentWingoResults, user?.id]);

  const defaultGame = games.find((g) => g.isDefault) || games[0] || null;
  const filteredGames = useMemo(() => {
    if (gameFilter === 'all') return games;
    if (gameFilter === 'wingo') {
      return games.filter((g) => PARTNER_WINGO_SLUGS.has(g.slug) || g.isDefault);
    }
    if (gameFilter === 'embed') return games.filter((g) => g.gameMode === 'embed');
    return games.filter((g) => g.gameMode !== 'embed');
  }, [games, gameFilter]);

  const gameRows = useMemo(() => {
    const rows: GameSummary[][] = [];
    for (let i = 0; i < filteredGames.length; i += 10) {
      rows.push(filteredGames.slice(i, i + 10));
    }
    return rows;
  }, [filteredGames]);

  const scrollGameRow = (rowIdx: number, direction: 'left' | 'right') => {
    const el = rowScrollRefs.current[rowIdx];
    if (!el) return;
    el.scrollBy({
      left: direction === 'left' ? -560 : 560,
      behavior: 'smooth',
    });
  };

  const handleAcceptTerms = useCallback(() => {
    const ts = new Date().toISOString();
    setTermsAcceptedAt(ts);
    try {
      localStorage.setItem(TERMS_STORAGE_KEY, ts);
    } catch {
      // ignore
    }
  }, []);

  const openGuideTerms = (tab: 'guide' | 'terms' = 'guide') => {
    setGuideInitialTab(tab);
    setView('guide');
  };

  const handleNavigate = (target: PageView) => {
    if (
      (target === 'wallet' ||
        target === 'payment-gateway' ||
        target === 'history' ||
        target === 'settings') &&
      !user
    ) {
      setView('auth');
      return;
    }
    if (target === 'admin' && (!user || !user.isAdmin)) {
      setView(user ? 'games' : 'auth');
      return;
    }
    setView(target);
  };

  const openPaymentGateway = (suggestedAmount?: number) => {
    if (!user) {
      setView('auth');
      return;
    }
    setGatewayReturnView(view === 'payment-gateway' ? 'wallet' : view);
    setGatewayAmount(
      suggestedAmount && suggestedAmount > 0 ? Math.round(suggestedAmount) : null
    );
    setView('payment-gateway');
  };

  const handleLaunchGame = (game: GameSummary) => {
    if (platformConfig?.maintenanceMode && !user?.isAdmin) {
      return;
    }
    setActiveGame(game);
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setActiveGame(null);
    setView('games');
  };

  const handleAuthenticated = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setBanBanner(null);
    setView('games');
  };

  const brandName = platformConfig?.brandName || 'KWG Arena';
  const showAnnouncement =
    Boolean(platformConfig?.announcementEnabled) &&
    Boolean(platformConfig?.announcementText?.trim());
  const maintenanceBlocked = Boolean(platformConfig?.maintenanceMode) && !user?.isAdmin;
  const aiPassActive = isUserAiPassUnlocked(user, nowTick);
  const aiPlans = useMemo(
    () => getAiSubscriptionPlans(platformConfig || undefined),
    [platformConfig]
  );
  const telegramUrl = normalizeTelegramSupportUrl(platformConfig?.supportUrl);
  const telegramHandle = getTelegramDisplayHandle(platformConfig?.supportUrl);

  const openAiPurchase = (planId: AiPlanId = 'weekly') => {
    if (!user) {
      setView('auth');
      return;
    }
    setAiUpgradePlanId(planId);
    setShowAiUpgradeModal(true);
  };

  useEffect(() => {
    if (autoPopupTriggeredRef.current) return undefined;
    if (view !== 'games' || banBanner || activeGame) return undefined;
    try {
      if (sessionStorage.getItem('kwg_ai_diff_popup_seen') === '1') {
        autoPopupTriggeredRef.current = true;
        return undefined;
      }
    } catch {
      // ignore storage errors
    }
    const timer = window.setTimeout(() => {
      autoPopupTriggeredRef.current = true;
      try {
        sessionStorage.setItem('kwg_ai_diff_popup_seen', '1');
      } catch {
        // ignore
      }
      setShowAutoDiffPopup(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [view, banBanner, activeGame]);

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0 bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Sticky 3-Zone Architectural Header */}
      <header className="sticky top-0 z-30 studio-card rounded-none border-x-0 border-t-0 backdrop-blur-xl bg-opacity-90">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => handleNavigate('games')}
            className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-lg ink-btn font-black text-sm flex items-center justify-center">
              {brandName.slice(0, 1).toUpperCase()}
            </span>
            <span>{brandName}</span>
          </button>

          <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-semibold text-[var(--text-secondary)]">
            <button
              type="button"
              onClick={() => handleNavigate('games')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                view === 'games'
                  ? 'text-[var(--text-primary)] border-[var(--accent-primary)]'
                  : 'border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              Games
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('wallet')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                view === 'wallet' || view === 'payment-gateway'
                  ? 'text-[var(--text-primary)] border-[var(--accent-primary)]'
                  : 'border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              Wallet
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('history')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                view === 'history'
                  ? 'text-[var(--text-primary)] border-[var(--accent-primary)]'
                  : 'border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('settings')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                view === 'settings'
                  ? 'text-[var(--text-primary)] border-[var(--accent-primary)]'
                  : 'border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => openGuideTerms('guide')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 inline-flex items-center gap-1 ${
                view === 'guide'
                  ? 'text-[var(--text-primary)] border-[var(--accent-primary)]'
                  : 'border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              <span>Guide & Terms</span>
            </button>
            {user?.isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                  view === 'admin'
                    ? 'text-[#d97706] border-[#d97706]'
                    : 'border-transparent text-amber-600 dark:text-amber-400 hover:text-[#d97706]'
                }`}
              >
                Admin
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAiHubModal(true)}
              className={`btn-shine press-scale min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 border ${
                aiPassActive
                  ? 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                  : 'bg-gradient-to-r from-purple-600 via-blue-600 to-emerald-500 border-purple-300/40 text-white shadow-md shadow-purple-500/25'
              }`}
            >
              <Brain className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">AI Pass</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/25 text-amber-300">
                {aiPassActive ? 'VIP' : `₹${aiPlans[0]?.price ?? 101}+`}
              </span>
            </button>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => openPaymentGateway()}
                  className="press-scale min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl ink-btn text-xs font-bold font-mono tabular-nums whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="hidden lg:inline">{formatCurrency(user.walletBalance)} · Deposit QR</span>
                  <span className="lg:hidden">{formatCurrency(user.walletBalance)}</span>
                </button>

                <div ref={userMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((prev) => !prev)}
                    aria-expanded={userMenuOpen}
                    aria-label="Open player menu"
                    className="press-scale min-h-[40px] px-2.5 py-1.5 rounded-xl studio-card border border-white/15 hover:border-[var(--accent-primary)]/50 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer max-w-[190px] sm:max-w-[260px]"
                  >
                    <span className="w-6 h-6 rounded-lg accent-btn text-[11px] font-black flex items-center justify-center shrink-0">
                      {user.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate font-bold">{user.username}</span>
                    <AiPassBadge active={aiPassActive} size="xs" />
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 transition-transform ${
                        userMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-2xl studio-card border border-white/15 shadow-2xl p-3 space-y-2.5 z-50 animate-modal-pop">
                      <div className="p-3 rounded-xl studio-muted border space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold truncate">{user.username}</span>
                          <AiPassBadge active={aiPassActive} size="xs" />
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                          UID {user.uid} · {user.phone}
                        </div>
                        <div
                          className={`text-[11px] font-bold ${
                            aiPassActive
                              ? 'text-amber-500 dark:text-amber-300'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {aiPassActive
                            ? user.isAdmin
                              ? 'Admin AI PASS Active'
                              : `AI PASS Active · ${formatRemainingDuration(user.aiPredExpiresAt, nowTick)}`
                            : 'No Active AI PASS Membership'}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleNavigate('settings');
                          }}
                          className="w-full min-h-[38px] px-3 rounded-xl hover:bg-white/10 text-xs font-semibold flex items-center gap-2.5 cursor-pointer text-left"
                        >
                          <User className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                          <span>Profile &amp; AI PASS Settings</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleNavigate('wallet');
                          }}
                          className="w-full min-h-[38px] px-3 rounded-xl hover:bg-white/10 text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer text-left"
                        >
                          <span className="inline-flex items-center gap-2.5">
                            <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Wallet Vault</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-500">
                            {formatCurrency(user.walletBalance)}
                          </span>
                        </button>
                        {!aiPassActive && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              openAiPurchase('weekly');
                            }}
                            className="w-full min-h-[38px] px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                          >
                            <Brain className="w-4 h-4 shrink-0" />
                            <span>Activate AI PASS (₹{aiPlans[0]?.price ?? 101}+)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            void handleLogout();
                          }}
                          className="w-full min-h-[38px] px-3 rounded-xl hover:bg-rose-500/15 text-rose-500 text-xs font-bold flex items-center gap-2.5 cursor-pointer text-left"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setView('auth')}
                className="btn-shine press-scale min-h-[40px] px-4 sm:px-5 py-2 rounded-xl accent-btn text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Compact Workspace Toolbar: Theme Mode Switcher + Live Clock + Gateway Shortcut */}
      <div className="border-b studio-divider studio-muted">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 font-mono tabular-nums text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <strong className="text-[var(--text-primary)]">
                #{wingoTicker.periodId.slice(-4)}
              </strong>
              <span>· 00:{String(wingoTicker.secLeft).padStart(2, '0')}</span>
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              {aiPassActive ? 'Gemini AI Enabled' : 'Standard Pattern Engine'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press-scale px-2.5 py-1 rounded-lg studio-card text-[11px] font-bold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>{telegramHandle}</span>
            </a>

            <div className="inline-flex items-center gap-1 p-0.5 studio-card rounded-xl">
              {(
                [
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'neon', label: 'Neon', icon: Sparkles },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = appTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAppTheme(t.id)}
                    className={`press-scale px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-all ${
                      active
                        ? 'accent-btn shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Admin-Controlled Announcement Bar */}
      {showAnnouncement && (
        <div className="ink-card rounded-none border-x-0 border-t-0 text-white px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-semibold text-center">
            <Megaphone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{platformConfig?.announcementText}</span>
          </div>
        </div>
      )}

      {/* Maintenance Notice */}
      {platformConfig?.maintenanceMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300 text-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {platformConfig.maintenanceMessage}
              {user?.isAdmin ? ' (Admin override active)' : ''}
            </span>
          </div>
        </div>
      )}

      <main className="flex-1">
        <div key={view} className="animate-view-enter">
          {view === 'auth' && (
            <AuthView
              platformConfig={platformConfig}
              banBanner={banBanner}
              onClearBanBanner={() => setBanBanner(null)}
              onAuthenticated={handleAuthenticated}
              onTermsAccepted={handleAcceptTerms}
              onOpenGuideTerms={(t) => openGuideTerms(t)}
              onBackToGames={() => setView('games')}
            />
          )}

          {view === 'guide' && (
            <GuideTermsView
              key={guideInitialTab}
              initialTab={guideInitialTab}
              platformConfig={platformConfig}
              user={user}
              termsAcceptedAt={termsAcceptedAt}
              onAcceptTerms={handleAcceptTerms}
              onGoToGames={() => setView('games')}
              onGoToAuth={() => setView('auth')}
              onOpenGateway={() => openPaymentGateway()}
            />
          )}

          {view === 'games' && (
            <div className="max-w-7xl mx-auto px-4 py-6 lg:py-10 space-y-8">
              {!termsAcceptedAt && (
                <div className="studio-card rounded-2xl px-4 py-3 border-amber-500/35 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 animate-fade-up">
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      <strong>Player Guide & User Terms:</strong> Review deposit rules & agree to User Terms & Conditions.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openGuideTerms('terms')}
                      className="press-scale px-3.5 py-1.5 rounded-lg accent-btn text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      Review & Agree
                    </button>
                  </div>
                </div>
              )}
            {/* Rearranged Flipped Asymmetric Hero Showcase */}
            {defaultGame && (
              <section className="studio-card rounded-2xl overflow-hidden animate-fade-up">
                <div className="grid grid-cols-1 lg:grid-cols-12">
                  {/* Visual Column Now Placed Left */}
                  <div className="lg:col-span-5 studio-muted border-b lg:border-b-0 lg:border-r studio-divider p-5 sm:p-6 flex flex-col gap-4 justify-center">
                    <div className="aspect-[16/10] rounded-xl overflow-hidden border studio-divider">
                      {imgErrors['hero-studio'] ? (
                        <div className="w-full h-full flex items-center justify-center ink-card text-white text-sm font-bold">
                          {brandName} Studio
                        </div>
                      ) : (
                        <img
                          src="/src/assets/images/porcelain_studio_hero_1795626990487.jpg"
                          alt="Porcelain architectural gaming studio"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setImgErrors((p) => ({ ...p, 'hero-studio': true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-3 items-center studio-card rounded-xl p-3">
                      <div className="col-span-2 aspect-[4/3] rounded-lg overflow-hidden studio-muted">
                        {imgErrors['hero-token'] ? (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">
                            {defaultGame.name}
                          </div>
                        ) : (
                          <img
                            src="/src/assets/images/vault_showcase_object_1795626989997.jpg"
                            alt="Precision game token sculpture"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgErrors((p) => ({ ...p, 'hero-token': true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="col-span-3 min-w-0">
                        <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          In-Game Mod Overlay
                        </div>
                        <div className="text-sm font-extrabold truncate mt-0.5">
                          AI Pattern + Sureshot
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                          Reads live API draws before every round
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action & Editorial Copy Now Placed Right */}
                  <div className="lg:col-span-7 p-6 sm:p-8 lg:p-12 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider">
                        Featured Arena ·{' '}
                        {defaultGame.pricing_type === 'free'
                          ? 'Free Entry'
                          : formatCurrency(defaultGame.price)}
                      </div>
                      <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance leading-[1.08]">
                        {defaultGame.title}
                      </h1>
                      <p className="mt-4 text-sm sm:text-base text-[var(--text-muted)] leading-relaxed max-w-2xl">
                        {defaultGame.description}
                      </p>
                    </div>

                    <div className="mt-8 space-y-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={maintenanceBlocked}
                          onClick={() => handleLaunchGame(defaultGame)}
                          className="btn-shine press-scale min-h-[50px] px-7 py-3 rounded-xl accent-btn disabled:opacity-50 font-bold text-sm inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          {maintenanceBlocked
                            ? 'Maintenance Active'
                            : `Launch ${defaultGame.name}`}
                        </button>

                        {user ? (
                          <button
                            type="button"
                            onClick={() => openPaymentGateway()}
                            className="press-scale min-h-[50px] px-5 py-3 rounded-xl studio-muted border text-xs font-bold font-mono tabular-nums inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                          >
                            <QrCode className="w-4 h-4 text-[var(--accent-primary)]" />
                            Payment Gateway · {formatCurrency(user.walletBalance)}
                            <ArrowUpRight className="w-4 h-4 text-[var(--text-secondary)]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setView('auth')}
                            className="press-scale min-h-[50px] px-5 py-3 rounded-xl studio-muted border text-sm font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Sign In / Register
                          </button>
                        )}
                      </div>

                      <div className="pt-4 border-t studio-divider flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                        <span>Autonomous 3-Strategy AI Engine</span>
                        <span aria-hidden="true">·</span>
                        <span>Walk-Forward Accuracy Calibration</span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setShowAiHubModal(true)}
                          className="font-bold text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          See AI Pass vs Default (₹{aiPlans[0]?.price ?? 101}+)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Heavy Gemini AI Pass Promotion & AI vs Default Spotlight */}
            <section
              className="studio-card rounded-2xl p-5 sm:p-6 border border-purple-500/45 bg-gradient-to-br from-purple-600/18 via-blue-600/12 to-emerald-500/18 space-y-5 animate-fade-up"
              style={{ animationDelay: '30ms' }}
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl accent-btn flex items-center justify-center shrink-0">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                      <span>
                        {aiPassActive
                          ? user?.isAdmin
                            ? 'Gemini AI Admin Pass Active'
                            : `Gemini AI Pass Active · ${formatRemainingDuration(user?.aiPredExpiresAt, nowTick)}`
                          : 'AUTONOMOUS 3-STRATEGY AI · GEMINI 4 HYDROGEN'}
                      </span>
                      <AiPassBadge active={aiPassActive} size="xs" />
                    </div>
                    <h2 className="text-lg sm:text-xl font-extrabold">
                      {aiPassActive
                        ? 'Autonomous 3-Strategy Gemini AI & Live History Unlocked'
                        : 'Upgrade to AI PASS — Autonomous Pattern + Momentum + Dragon AI'}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Default prediction uses a static rule. <strong>Gemini AI Pass</strong> reads 30 verified live draws, evaluates <strong>Pattern Brain, Momentum Trend &amp; Dragon Reversal</strong> with walk-forward hit rates, and picks the strongest BIG/SMALL call every round with tracked history.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAutoDiffPopup(true)}
                    className="press-scale min-h-[44px] px-4 rounded-xl studio-card border border-purple-400/40 text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>AI vs Default (5s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => (user ? setShowAiHubModal(true) : setView('auth'))}
                    className="btn-shine press-scale min-h-[44px] px-5 rounded-xl accent-btn text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Brain className="w-4 h-4" />
                    <span>
                      {!user
                        ? `Claim 24h Free AI · ₹${aiPlans[0]?.price ?? 101}+`
                        : aiPassActive
                        ? 'View / Extend AI Pass'
                        : `Unlock AI Pass (₹${aiPlans[0]?.price ?? 101}+)`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Explicit Default vs AI Pass Diff + All 4 Promotional Pricing Tiers */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
                <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 text-xs">
                  <div className="rounded-xl bg-black/35 border border-rose-500/25 px-3.5 py-2.5">
                    <div className="font-extrabold text-rose-300">Default Mode (Free · No Gemini AI)</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      Basic single-pattern fallback only. Gemini AI endpoint &amp; 3-strategy consensus remain locked without AI PASS.
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3.5 py-2.5">
                    <div className="font-extrabold text-emerald-300">Gemini AI Pass (VIP Membership)</div>
                    <div className="text-[11px] text-emerald-100 mt-0.5">
                      Unlocks glowing AI PASS badge, autonomous 3-strategy selection, dynamic historical weighting &amp; live WIN/LOSS tracking.
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {aiPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => openAiPurchase(plan.id)}
                      className="card-lift press-scale text-left rounded-xl bg-black/45 hover:bg-black/60 border border-white/15 hover:border-[var(--accent-primary)] p-3 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-extrabold uppercase text-[var(--accent-primary)]">
                          {plan.durationLabel}
                        </span>
                        {plan.badge && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xl font-extrabold text-white tabular-nums mt-1">
                        ₹{plan.price}
                      </div>
                      <div className="text-[10px] text-slate-300 truncate mt-0.5">
                        {plan.savingsNote}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 4-Metric Quick Workspace Strip */}
            <section
              className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up"
              style={{ animationDelay: '40ms' }}
            >
              <div className="card-lift studio-card rounded-2xl p-4 sm:p-5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Wingo 1M Clock
                </div>
                <div className="mt-1.5 text-xl font-extrabold font-mono tabular-nums">
                  00:{String(wingoTicker.secLeft).padStart(2, '0')}
                </div>
                <div className="text-xs text-[var(--text-secondary)] font-mono mt-0.5 truncate">
                  Period {wingoTicker.periodId}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAiHubModal(true)}
                className="card-lift press-scale studio-card rounded-2xl p-4 sm:p-5 text-left cursor-pointer border-purple-500/35"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  Gemini AI Pass
                </div>
                <div className="mt-1.5 text-xl font-extrabold font-mono tabular-nums">
                  {aiPassActive
                    ? user?.isAdmin
                      ? 'Admin Active'
                      : formatRemainingDuration(user?.aiPredExpiresAt, nowTick)
                    : `₹${aiPlans[0]?.price ?? 101}+`}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {aiPassActive ? '3-Strategy Gemini AI Active' : 'See AI vs Default & Unlock'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('wallet')}
                className="card-lift press-scale studio-card rounded-2xl p-4 sm:p-5 text-left cursor-pointer"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Wallet Vault
                </div>
                <div className="mt-1.5 text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {user ? formatCurrency(user.walletBalance) : 'Sign In'}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {user ? `UID ${user.uid} · Track ledger` : 'Access coins & deposits'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => openPaymentGateway()}
                className="card-lift press-scale ink-card rounded-2xl p-4 sm:p-5 text-left text-white cursor-pointer"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 inline-flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" />
                  UPI Gateway
                </div>
                <div className="mt-1.5 text-xl font-extrabold">Add Coins</div>
                <div className="text-xs text-slate-400 mt-0.5 inline-flex items-center gap-1">
                  <span>Generate QR & UTR checkout</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </section>

            {/* Horizontal Left-to-Right Game Showcase (Max 10 Games Per Row) */}
            <section className="space-y-6">
              <div
                className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-fade-up"
                style={{ animationDelay: '70ms' }}
              >
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                    Game Library
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                    Slide left-to-right across each row (10 games per row). Additional games appear cleanly in rows below.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 studio-card rounded-xl overflow-x-auto self-start md:self-auto">
                  {(
                    [
                      { id: 'all', label: 'All Games' },
                      { id: 'wingo', label: 'Wingo 1M' },
                      { id: 'embed', label: 'Embeds' },
                      { id: 'source', label: 'Source' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setGameFilter(f.id)}
                      className={`press-scale px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer transition-all ${
                        gameFilter === f.id
                          ? 'ink-btn font-bold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {gamesLoading ? (
                <div className="flex gap-5 overflow-hidden">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="w-[260px] sm:w-[278px] shrink-0 h-80 studio-card rounded-2xl animate-pulse"
                    />
                  ))}
                </div>
              ) : gameRows.length === 0 ? (
                <div className="studio-card rounded-2xl p-10 text-center text-sm text-[var(--text-secondary)]">
                  No games match the selected filter.
                </div>
              ) : (
                <div className="space-y-7">
                  {gameRows.map((rowGames, rowIdx) => {
                    const startNumber = rowIdx * 10 + 1;
                    const endNumber = startNumber + rowGames.length - 1;
                    return (
                      <div key={rowIdx} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 text-xs font-mono font-bold text-[var(--text-secondary)]">
                            <span className="text-[var(--accent-primary)]">
                              ROW {String(rowIdx + 1).padStart(2, '0')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Games {startNumber}–{endNumber} ({rowGames.length}/10)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => scrollGameRow(rowIdx, 'left')}
                              aria-label={`Scroll row ${rowIdx + 1} left`}
                              className="press-scale w-9 h-9 rounded-xl studio-card flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => scrollGameRow(rowIdx, 'right')}
                              aria-label={`Scroll row ${rowIdx + 1} right`}
                              className="press-scale w-9 h-9 rounded-xl studio-card flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div
                          ref={(el) => {
                            rowScrollRefs.current[rowIdx] = el;
                          }}
                          className="horizontal-game-track flex flex-nowrap items-stretch gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-3 pt-1"
                        >
                          {rowGames.map((game, cardIdx) => {
                            const isPaidLocked =
                              game.pricing_type === 'paid' &&
                              !(game.billing_mode === 'once' && game.isUnlocked);

                            return (
                              <article
                                key={game.id}
                                className="w-[260px] sm:w-[278px] shrink-0 snap-start card-lift group studio-card hover:border-[var(--accent-primary)]/60 rounded-2xl overflow-hidden flex flex-col animate-slide-card"
                                style={{
                                  animationDelay: `${Math.min(cardIdx * 55, 420)}ms`,
                                }}
                              >
                                <div className="aspect-[4/3] border-b studio-muted relative overflow-hidden studio-divider shrink-0">
                                  {imgErrors[`g-${game.id}`] ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center ink-card text-white p-4 text-center">
                                      <Gamepad2 className="w-8 h-8 mb-2 text-blue-400" />
                                      <span className="text-sm font-bold">{game.name}</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={game.thumbnail}
                                      alt={game.title}
                                      referrerPolicy="no-referrer"
                                      onError={() =>
                                        setImgErrors((prev) => ({
                                          ...prev,
                                          [`g-${game.id}`]: true,
                                        }))
                                      }
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                  )}
                                </div>

                                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                  <div>
                                    <div className="text-xs text-[var(--text-secondary)] font-medium truncate">
                                      {game.name}
                                      <span aria-hidden="true"> · </span>
                                      {game.gameMode === 'embed' ? 'Web Embed' : 'Interactive'}
                                      <span aria-hidden="true"> · </span>
                                      <span
                                        className={
                                          game.pricing_type === 'free'
                                            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                            : 'text-[#d97706] font-bold font-mono tabular-nums'
                                        }
                                      >
                                        {game.pricing_type === 'free'
                                          ? 'Free'
                                          : game.isUnlocked && game.billing_mode === 'once'
                                          ? 'Unlocked'
                                          : formatCurrency(game.price)}
                                      </span>
                                    </div>
                                    <h3 className="mt-1.5 text-base font-extrabold line-clamp-1">
                                      {game.title}
                                    </h3>
                                    <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                                      {game.description}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={maintenanceBlocked}
                                    onClick={() => handleLaunchGame(game)}
                                    className="btn-shine press-scale w-full min-h-[44px] px-4 py-2.5 rounded-xl ink-btn hover:opacity-95 disabled:opacity-50 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                                  >
                                    {isPaidLocked ? (
                                      <Lock className="w-3.5 h-3.5" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                    )}
                                    {maintenanceBlocked
                                      ? 'Maintenance Active'
                                      : isPaidLocked
                                      ? `Unlock (${formatCurrency(game.price)})`
                                      : `Play ${game.name}`}
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'wallet' && user && (
          <WalletView
            user={user}
            onBalanceSync={(bal) =>
              setUser((prev) => (prev ? { ...prev, walletBalance: bal } : prev))
            }
            onOpenGateway={(amt) => openPaymentGateway(amt)}
          />
        )}

        {view === 'payment-gateway' && user && (
          <PaymentGatewayPage
            user={user}
            initialAmount={gatewayAmount}
            onBack={() => setView(gatewayReturnView === 'payment-gateway' ? 'wallet' : gatewayReturnView)}
            onOpenWallet={() => setView('wallet')}
            onDepositSubmitted={() => {
              // stay on receipt screen; WalletView reloads live on navigate
            }}
          />
        )}

        {view === 'history' && user && <HistoryView />}

        {view === 'settings' && user && (
          <SettingsView
            user={user}
            platformConfig={platformConfig}
            appTheme={appTheme}
            onThemeChange={setAppTheme}
            onUserUpdated={setUser}
            onOpenGateway={(amt) => openPaymentGateway(amt)}
            onLogout={handleLogout}
          />
        )}

        {view === 'admin' && user?.isAdmin && (
          <AdminPanel
            onGamesChanged={async () => {
              await loadGames();
            }}
            onPlatformConfigChanged={(cfg) => {
              setPlatformConfig(cfg);
            }}
          />
        )}
        </div>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="hidden md:block border-t studio-divider studio-muted py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
          <span>{brandName} · Gaming & Smart Predictor Studio</span>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-300 text-sky-400 font-bold inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Support {telegramHandle}
            </a>
            <button
              type="button"
              onClick={() => openGuideTerms('guide')}
              className="hover:text-[var(--text-primary)] font-semibold cursor-pointer"
            >
              Player Guide
            </button>
            <button
              type="button"
              onClick={() => openGuideTerms('terms')}
              className="hover:text-[var(--text-primary)] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Terms & Conditions</span>
              {termsAcceptedAt && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              )}
            </button>
            <span className="font-mono">
              {user ? `UID ${user.uid}` : 'Guest Session'} · {appTheme.toUpperCase()} MODE
            </span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 studio-card rounded-none border-x-0 border-b-0 backdrop-blur-xl h-16"
      >
        <div
          className={`grid h-full ${
            user?.isAdmin ? 'grid-cols-6' : 'grid-cols-5'
          } items-center`}
        >
          <button
            type="button"
            onClick={() => handleNavigate('games')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
              view === 'games'
                ? 'text-[var(--accent-primary)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Gamepad2 className="w-5 h-5" />
            <span>Games</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('wallet')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
              view === 'wallet' || view === 'payment-gateway'
                ? 'text-[var(--accent-primary)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span>Wallet</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('history')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
              view === 'history'
                ? 'text-[var(--accent-primary)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <History className="w-5 h-5" />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={() => openGuideTerms('guide')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
              view === 'guide'
                ? 'text-[var(--accent-primary)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span>Guide</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('settings')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
              view === 'settings'
                ? 'text-[var(--accent-primary)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>

          {user?.isAdmin && (
            <button
              type="button"
              onClick={() => handleNavigate('admin')}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
                view === 'admin' ? 'text-[#d97706] font-bold' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Admin</span>
            </button>
          )}
        </div>
      </nav>

      {banBanner && view !== 'auth' && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="animate-modal-pop w-full max-w-md studio-card rounded-2xl overflow-hidden shadow-2xl border border-rose-500/45">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400">
                    Account Suspension Notice
                  </div>
                  <h2 className="text-lg font-extrabold mt-0.5 text-rose-300">
                    {banBanner.banReason}
                  </h2>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs sm:text-sm text-rose-100 leading-relaxed space-y-2">
                <p>{banBanner.banNotice}</p>
                <div className="text-xs font-mono text-rose-300 pt-1 border-t border-rose-500/20 space-y-0.5">
                  {banBanner.bannedAt && (
                    <div>Banned on: {formatDateTime(banBanner.bannedAt)}</div>
                  )}
                  <div>
                    {banBanner.banExpiresAt
                      ? `Ends on: ${formatDateTime(banBanner.banExpiresAt)}`
                      : 'Duration: Permanent Suspension'}
                  </div>
                </div>
              </div>

              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="press-scale w-full min-h-[46px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Contact Telegram Support ({telegramHandle})
              </a>

              <button
                type="button"
                onClick={() => {
                  setView('auth');
                }}
                className="press-scale w-full min-h-[46px] rounded-xl studio-muted border text-sm font-bold text-[var(--text-primary)] cursor-pointer"
              >
                Acknowledge &amp; Go to Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {showAutoDiffPopup && !showAiHubModal && !showAiUpgradeModal && !activeGame && (
        <AiPassComparisonModal
          mode="auto-popup"
          user={user}
          platformConfig={platformConfig}
          onClose={() => setShowAutoDiffPopup(false)}
          onSelectPlan={(planId) => {
            setShowAutoDiffPopup(false);
            openAiPurchase(planId || 'weekly');
          }}
        />
      )}

      {showAiHubModal && (
        <AiPassComparisonModal
          mode="hub"
          user={user}
          platformConfig={platformConfig}
          onClose={() => setShowAiHubModal(false)}
          onSelectPlan={(planId) => {
            setShowAiHubModal(false);
            openAiPurchase(planId || 'weekly');
          }}
        />
      )}

      {showAiUpgradeModal && (
        <PredictionUnlockModal
          feature="ai"
          initialPlanId={aiUpgradePlanId}
          user={user}
          platformConfig={platformConfig}
          onClose={() => setShowAiUpgradeModal(false)}
          onUserUpdated={setUser}
          onGoToWallet={(amt) => {
            setShowAiUpgradeModal(false);
            openPaymentGateway(amt);
          }}
          onRequireAuth={() => {
            setShowAiUpgradeModal(false);
            setView('auth');
          }}
        />
      )}

      {activeGame && (
        <ErrorBoundary
          fallbackTitle="Unable to render game session"
          onReset={() => setActiveGame(null)}
        >
          <GamePlayModal
            game={activeGame}
            user={user}
            platformConfig={platformConfig}
            recentWingoResults={recentWingoResults}
            onClose={() => setActiveGame(null)}
            onRequireAuth={() => {
              setActiveGame(null);
              setView('auth');
            }}
            onGoToWallet={(amt) => {
              setActiveGame(null);
              openPaymentGateway(amt);
            }}
            onUserUpdated={setUser}
            onGameUnlocked={loadGames}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
