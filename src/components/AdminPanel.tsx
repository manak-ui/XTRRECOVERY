import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Edit3,
  ShieldBan,
  ShieldCheck,
  Wallet,
  Check,
  X,
  Upload,
  RotateCcw,
  Globe,
  Code2,
  SlidersHorizontal,
  Eye,
  LayoutDashboard,
  Users,
  IndianRupee,
  Gamepad2,
  CreditCard,
  Settings2,
  Brain,
  Clock,
  Hash,
  Palette,
  Megaphone,
  TrendingUp,
} from 'lucide-react';
import { apiRequest, formatCurrency, formatDateTime, resolveAssetUrl } from '../api';
import type {
  ActivityLog,
  AdminGame,
  AdminStatsResponse,
  DepositRecord,
  GameMode,
  ModMenuConfig,
  ModMenuStyle,
  PaymentSettings,
  PlatformConfig,
  PrefilledBanNotice,
  StrategyConfigState,
  UserProfile,
} from '../types';
import {
  MOD_MENU_PRESETS,
  formatRemainingDuration,
  isFeatureUnlocked,
  isUserAiPassUnlocked,
  normalizeStrategyConfig,
  resolveMenuTheme,
} from '../utils/wingo';
import { AdminCombinedAiDashboard } from './AdminCombinedAiDashboard';
import { AiPassBadge } from './AiPassBadge';

type AdminTab = 'dashboard' | 'strategies' | 'users' | 'deposits' | 'games' | 'payments' | 'system';

interface AdminPanelProps {
  onGamesChanged: () => void;
  onPlatformConfigChanged?: (config: PlatformConfig) => void;
}

const DEFAULT_SYSTEM_CONFIG: PlatformConfig = {
  brandName: 'KWG Arena',
  tagline: 'VIP Gaming Vault & Smart Wingo Predictor',
  announcementText: '',
  announcementEnabled: false,
  supportUrl: '',
  registrationsEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'Platform maintenance is underway. Back online shortly.',
  welcomeBonus: 0,
  numberPredPrice: 20,
  numberPredHours: 24,
  numberPredEnabled: true,
  colorPredPrice: 10,
  colorPredHours: 48,
  colorPredEnabled: true,
  minUnlockHours: 1,
  maxUnlockHours: 720,
  aiWeeklyPrice: 101,
  ai15DaysPrice: 250,
  aiMonthlyPrice: 499,
  aiYearlyPrice: 1199,
  aiPredEnabled: true,
  predictorMode: 'pattern-ai',
  strategyConfig: {
    patternBrainEnabled: true,
    momentumTrendEnabled: false,
    dragonContrarianEnabled: false,
    allThreeStrategiesActive: false,
  },
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  onGamesChanged,
  onPlatformConfigChanged,
}) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [period, setPeriod] = useState<'today' | 'yesterday' | 'weekly' | 'monthly' | 'yearly'>('today');
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [aiFilter, setAiFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [aiPassStats, setAiPassStats] = useState<{
    activeCount: number;
    expiredCount: number;
    freeCount: number;
    totalUsers: number;
  } | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<ActivityLog[]>([]);
  const [banNotices, setBanNotices] = useState<PrefilledBanNotice[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [walletAction, setWalletAction] = useState<'credit' | 'debit'>('credit');
  const [walletAmt, setWalletAmt] = useState('');
  const [walletNote, setWalletNote] = useState('');
  const [passHours, setPassHours] = useState('168');
  const [customAiExpiryInput, setCustomAiExpiryInput] = useState('');
  const [banMode, setBanMode] = useState<'prefilled' | 'custom'>('prefilled');
  const [banDurationMode, setBanDurationMode] = useState<'permanent' | 'timed'>('permanent');
  const [banDurationHours, setBanDurationHours] = useState('24');
  const [selectedPrefilledId, setSelectedPrefilledId] = useState('');
  const [customBanReason, setCustomBanReason] = useState('');
  const [customBanNotice, setCustomBanNotice] = useState('');
  const [unbanNote, setUnbanNote] = useState('');
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);

  const [depositFilter, setDepositFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositNotes, setDepositNotes] = useState<Record<number, string>>({});
  const [depositCustomStatuses, setDepositCustomStatuses] = useState<Record<number, string>>({});

  const [games, setGames] = useState<AdminGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [editingGame, setEditingGame] = useState<AdminGame | null>(null);
  const [showGameForm, setShowGameForm] = useState(false);
  const [gameName, setGameName] = useState('');
  const [gameTitle, setGameTitle] = useState('');
  const [gameDesc, setGameDesc] = useState('');
  const [gameThumb, setGameThumb] = useState('/src/assets/images/arcade_vault_thumb_1795541885373.jpg');
  const [gamePricing, setGamePricing] = useState<'free' | 'paid'>('free');
  const [gamePrice, setGamePrice] = useState('50');
  const [gameBilling, setGameBilling] = useState<'once' | 'per_play'>('once');
  const [gameHtml, setGameHtml] = useState('');
  const [gameCss, setGameCss] = useState('');
  const [gameJs, setGameJs] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('embed');
  const [embedUrl, setEmbedUrl] = useState('');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [modMenuConfig, setModMenuConfig] = useState<ModMenuConfig>({
    enabled: true,
    menuType: 'wingo-full',
    themePreset: 'cyber-cyan',
    customAccent: '#00f2ff',
    customSecondaryAccent: '#9d4edd',
    customBadge: '',
    clockMode: 'utc-partner-api',
    showLevelSplit: true,
    showManualHistory: true,
    showColorNumberPred: true,
  });

  const [paySettings, setPaySettings] = useState<PaymentSettings>({
    upiId: '',
    payeeName: '',
    instructions: '',
    depositsEnabled: true,
    minDeposit: 100,
    maxDeposit: 50000,
  });
  const [payLoading, setPayLoading] = useState(false);

  const [sysConfig, setSysConfig] = useState<PlatformConfig>(DEFAULT_SYSTEM_CONFIG);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysSaving, setSysSaving] = useState(false);
  const [savingStrategies, setSavingStrategies] = useState(false);

  const loadStats = useCallback(async (p: string) => {
    setStatsLoading(true);
    try {
      const res = await apiRequest<AdminStatsResponse>(`/api/admin/stats?period=${p}`);
      setStats(res);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load stats.' });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(
    async (q: string, filterOverride?: 'all' | 'active' | 'expired') => {
      setUsersLoading(true);
      try {
        const targetFilter = filterOverride || aiFilter;
        const res = await apiRequest<{
          users: UserProfile[];
          aiPassStats?: {
            activeCount: number;
            expiredCount: number;
            freeCount: number;
            totalUsers: number;
          };
        }>(
          `/api/admin/users?q=${encodeURIComponent(q)}&aiFilter=${encodeURIComponent(targetFilter)}`
        );
        setUsers(res.users);
        if (res.aiPassStats) {
          setAiPassStats(res.aiPassStats);
        }
      } catch (err) {
        setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load users.' });
      } finally {
        setUsersLoading(false);
      }
    },
    [aiFilter]
  );

  const loadBanNotices = useCallback(async () => {
    try {
      const res = await apiRequest<{ notices: PrefilledBanNotice[] }>('/api/admin/ban-notices');
      setBanNotices(res.notices);
      if (res.notices.length > 0) {
        setSelectedPrefilledId(res.notices[0].id);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadDeposits = useCallback(async (status: string) => {
    setDepositsLoading(true);
    try {
      const res = await apiRequest<{ deposits: DepositRecord[] }>(
        `/api/admin/deposits?status=${status}`
      );
      setDeposits(res.deposits);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load deposits.' });
    } finally {
      setDepositsLoading(false);
    }
  }, []);

  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await apiRequest<{ games: AdminGame[] }>('/api/admin/games');
      setGames(res.games);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load games.' });
    } finally {
      setGamesLoading(false);
    }
  }, []);

  const loadPaymentSettings = useCallback(async () => {
    setPayLoading(true);
    try {
      const res = await apiRequest<{ settings: PaymentSettings }>('/api/admin/payment-settings');
      setPaySettings(res.settings);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load payment settings.' });
    } finally {
      setPayLoading(false);
    }
  }, []);

  const loadPlatformSettings = useCallback(async () => {
    setSysLoading(true);
    try {
      const res = await apiRequest<{ config: PlatformConfig }>('/api/admin/platform-settings');
      if (res.config) setSysConfig(res.config);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load platform controls.',
      });
    } finally {
      setSysLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadStats(period);
    if (tab === 'users') {
      loadUsers(userSearch, aiFilter);
      if (banNotices.length === 0) loadBanNotices();
    }
    if (tab === 'deposits') loadDeposits(depositFilter);
    if (tab === 'games') loadGames();
    if (tab === 'payments') loadPaymentSettings();
    if (tab === 'system' || tab === 'strategies') loadPlatformSettings();
  }, [
    tab,
    period,
    depositFilter,
    aiFilter,
    loadStats,
    loadUsers,
    loadBanNotices,
    loadDeposits,
    loadGames,
    loadPaymentSettings,
    loadPlatformSettings,
  ]);

  const toLocalDatetimeInput = (iso?: string | null): string => {
    const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : new Date(Date.now() + 7 * 86400 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const hasAi = isUserAiPassUnlocked(u, nowTick);
      if (aiFilter === 'active' && !hasAi) return false;
      if (aiFilter === 'expired' && hasAi) return false;
      if (!q) return true;
      return (
        u.uid.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, aiFilter, nowTick]);

  const inspectUser = async (userId: number) => {
    try {
      const res = await apiRequest<{ user: UserProfile; history: ActivityLog[] }>(
        `/api/admin/users/${userId}`
      );
      setSelectedUser(res.user);
      setSelectedUserHistory(res.history);
      setCustomAiExpiryInput(toLocalDatetimeInput(res.user.aiPredExpiresAt));
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Could not load user details.' });
    }
  };

  const handleWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(
        `/api/admin/users/${selectedUser.id}/wallet`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: walletAction,
            amount: Number(walletAmt),
            note: walletNote,
          }),
        }
      );
      setWalletAmt('');
      setWalletNote('');
      setSelectedUser(res.user);
      setNotice({ type: 'success', text: `Wallet updated for UID ${res.user.uid}.` });
      await inspectUser(res.user.id);
      await loadUsers(userSearch);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Wallet update failed.' });
    }
  };

  const handlePredictionPass = async (
    feature: 'number' | 'color' | 'ai',
    action: 'grant' | 'revoke' | 'set_expiry',
    hoursOverride?: number
  ) => {
    if (!selectedUser) return;
    setNotice(null);
    const hrs = Math.max(1, Math.round(hoursOverride ?? (Number(passHours) || 24)));
    const featureLabel =
      feature === 'ai' ? 'AI PASS Membership' : feature === 'number' ? 'Number' : 'Color';

    let payload: Record<string, unknown> = {
      feature,
      action,
      hours: hrs,
    };

    if (action === 'set_expiry') {
      if (!customAiExpiryInput) {
        setNotice({ type: 'error', text: 'Please select a valid custom expiry date and time.' });
        return;
      }
      const parsedDate = new Date(customAiExpiryInput);
      if (Number.isNaN(parsedDate.getTime())) {
        setNotice({ type: 'error', text: 'Invalid custom expiry date format.' });
        return;
      }
      payload = {
        feature,
        action: 'set_expiry',
        expiresAt: parsedDate.toISOString(),
      };
    }

    try {
      const res = await apiRequest<{ user: UserProfile }>(
        `/api/admin/users/${selectedUser.id}/prediction-pass`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setSelectedUser(res.user);
      setCustomAiExpiryInput(toLocalDatetimeInput(res.user.aiPredExpiresAt));
      setNotice({
        type: 'success',
        text:
          action === 'grant'
            ? `Granted ${hrs}h ${featureLabel} to UID ${res.user.uid}.`
            : action === 'set_expiry'
            ? `Updated custom ${featureLabel} expiry for UID ${res.user.uid}.`
            : `Removed ${featureLabel} from UID ${res.user.uid}.`,
      });
      await inspectUser(res.user.id);
      await loadUsers(userSearch, aiFilter);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update prediction pass.',
      });
    }
  };

  const handleBanUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setNotice(null);

    let reason = customBanReason;
    let noticeText = customBanNotice;
    if (banMode === 'prefilled') {
      const found = banNotices.find((b) => b.id === selectedPrefilledId);
      if (!found) return;
      reason = found.reason;
      noticeText = found.notice;
    }

    try {
      const parsedDuration = Math.max(1, Math.round(Number(banDurationHours) || 24));
      const res = await apiRequest<{ user: UserProfile }>(
        `/api/admin/users/${selectedUser.id}/ban`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason,
            notice: noticeText,
            isPermanent: banDurationMode === 'permanent',
            durationHours: banDurationMode === 'timed' ? parsedDuration : undefined,
          }),
        }
      );
      setSelectedUser(res.user);
      setCustomBanReason('');
      setCustomBanNotice('');
      setNotice({
        type: 'success',
        text:
          banDurationMode === 'timed'
            ? `User UID ${res.user.uid} banned for ${parsedDuration}h.`
            : `User UID ${res.user.uid} permanently banned.`,
      });
      await inspectUser(res.user.id);
      await loadUsers(userSearch);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Ban request failed.' });
    }
  };

  const handleUnbanUser = async () => {
    if (!selectedUser) return;
    setNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(
        `/api/admin/users/${selectedUser.id}/unban`,
        {
          method: 'POST',
          body: JSON.stringify({ note: unbanNote }),
        }
      );
      setSelectedUser(res.user);
      setUnbanNote('');
      setNotice({ type: 'success', text: `User UID ${res.user.uid} has been unbanned.` });
      await inspectUser(res.user.id);
      await loadUsers(userSearch);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Unban failed.' });
    }
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    setNotice(null);
    try {
      await apiRequest(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      });
      setConfirmDeleteUserId(null);
      setSelectedUser(null);
      setNotice({
        type: 'success',
        text: `User UID ${userToDelete.uid} (${userToDelete.phone}) deleted permanently.`,
      });
      await loadUsers(userSearch);
      void loadStats(period);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete user.',
      });
    }
  };

  const handleReviewDeposit = async (
    depositId: number,
    decision: 'completed' | 'rejected' | 'custom'
  ) => {
    setNotice(null);
    try {
      const adminNotice = depositNotes[depositId] || '';
      const customStatus = (depositCustomStatuses[depositId] ?? '').trim();
      await apiRequest(`/api/admin/deposits/${depositId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, adminNotice, customStatus }),
      });
      setNotice({
        type: 'success',
        text:
          decision === 'custom'
            ? `Updated custom deposit status${customStatus ? ` to "${customStatus}"` : ''}.`
            : `Deposit marked ${decision === 'completed' ? 'Completed and credited' : 'Rejected'}${
                customStatus ? ` ("${customStatus}")` : ''
              }.`,
      });
      await loadDeposits(depositFilter);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to review deposit.' });
    }
  };

  const DEFAULT_MOD_MENU_CONFIG: ModMenuConfig = {
    enabled: true,
    menuType: 'wingo-full',
    themePreset: 'cyber-cyan',
    customAccent: '#00f2ff',
    customSecondaryAccent: '#9d4edd',
    customBadge: '',
    clockMode: 'utc-partner-api',
    showLevelSplit: true,
    showManualHistory: true,
    showColorNumberPred: true,
  };

  const openNewGameForm = (defaultMode: GameMode = 'embed') => {
    setEditingGame(null);
    setGameName('');
    setGameTitle('');
    setGameDesc('');
    setGameThumb('/src/assets/images/arcade_vault_thumb_1795541885373.jpg');
    setGamePricing('free');
    setGamePrice('50');
    setGameBilling('once');
    setGameMode(defaultMode);
    setEmbedUrl('');
    setGameHtml('');
    setGameCss('');
    setGameJs('');
    setShowLivePreview(false);
    setModMenuConfig(DEFAULT_MOD_MENU_CONFIG);
    setShowGameForm(true);
  };

  const openEditGameForm = (g: AdminGame) => {
    setEditingGame(g);
    setGameName(g.name);
    setGameTitle(g.title);
    setGameDesc(g.description);
    setGameThumb(g.thumbnail);
    setGamePricing(g.pricing_type);
    setGamePrice(String(g.price || 50));
    setGameBilling(g.billing_mode || 'once');
    setGameMode(g.game_mode === 'embed' || Boolean(g.embed_url) ? 'embed' : 'source');
    setEmbedUrl(g.embed_url || '');
    setGameHtml(g.html_code || '');
    setGameCss(g.css_code || '');
    setGameJs(g.js_code || '');
    setShowLivePreview(false);
    setModMenuConfig(
      g.modMenuConfig || {
        ...DEFAULT_MOD_MENU_CONFIG,
        clockMode: g.slug === 'kwg-game' ? 'ist-standard' : 'utc-partner-api',
      }
    );
    setShowGameForm(true);
  };

  const handleRestoreDefaultKwg = async () => {
    setNotice(null);
    try {
      await apiRequest('/api/admin/games/restore-default', { method: 'POST' });
      setNotice({
        type: 'success',
        text: 'KWG Game has been restored back to its exact original version.',
      });
      await loadGames();
      onGamesChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not restore original KWG Game.',
      });
    }
  };

  const handleFileRead = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleSmartFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.css')) {
        setGameCss(text);
      } else if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
        setGameJs(text);
      } else {
        setGameHtml(text);
        if (!gameName.trim()) {
          const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
          const cleanName =
            titleMatch?.[1]?.trim() ||
            file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
          if (cleanName) {
            setGameName(cleanName.slice(0, 40));
            if (!gameTitle.trim()) setGameTitle(cleanName.slice(0, 80));
          }
        }
      }
    }
    setNotice({
      type: 'success',
      text: `Loaded ${files.length} source file${files.length > 1 ? 's' : ''} automatically.`,
    });
    e.target.value = '';
  };

  const handleThumbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setGameThumb(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const payload = {
      name: gameName,
      title: gameTitle || gameName,
      description: gameDesc,
      thumbnail: gameThumb,
      pricingType: gamePricing,
      price: gamePricing === 'paid' ? Number(gamePrice) : 0,
      billingMode: gameBilling,
      gameMode,
      embedUrl: gameMode === 'embed' ? embedUrl.trim() : '',
      htmlCode: gameMode === 'source' ? gameHtml : '',
      cssCode: gameMode === 'source' ? gameCss : '',
      jsCode: gameMode === 'source' ? gameJs : '',
      modMenuConfig,
    };

    try {
      if (editingGame) {
        await apiRequest(`/api/admin/games/${editingGame.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Updated game "${gameName}".` });
      } else {
        await apiRequest('/api/admin/games', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'success', text: `Published "${gameName}" to Home Page.` });
      }
      setShowGameForm(false);
      setShowLivePreview(false);
      await loadGames();
      onGamesChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save game.' });
    }
  };

  const handleDeleteGame = async (g: AdminGame) => {
    setNotice(null);
    try {
      await apiRequest(`/api/admin/games/${g.id}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: `Deleted game "${g.name}".` });
      await loadGames();
      onGamesChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete game.' });
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      const res = await apiRequest<{ settings: PaymentSettings }>('/api/admin/payment-settings', {
        method: 'PUT',
        body: JSON.stringify(paySettings),
      });
      setPaySettings(res.settings);
      setNotice({ type: 'success', text: 'UPI & payment settings saved.' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save payment settings.' });
    }
  };

  const handleSaveSystemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setSysSaving(true);
    try {
      const res = await apiRequest<{ config: PlatformConfig }>('/api/admin/platform-settings', {
        method: 'PUT',
        body: JSON.stringify(sysConfig),
      });
      setSysConfig(res.config);
      onPlatformConfigChanged?.(res.config);
      setNotice({
        type: 'success',
        text: 'All platform controls, prediction pricing, and AI predictor settings saved live.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update platform controls.',
      });
    } finally {
      setSysSaving(false);
    }
  };

  const handleUpdateAiStrategies = async (nextStrat: StrategyConfigState) => {
    setNotice(null);
    setSavingStrategies(true);
    const normalized = normalizeStrategyConfig(nextStrat, sysConfig.predictorMode);
    setSysConfig((prev) => ({
      ...prev,
      strategyConfig: normalized,
      predictorMode: normalized.patternBrainEnabled
        ? 'pattern-ai'
        : normalized.momentumTrendEnabled
        ? 'trend-follow'
        : normalized.dragonContrarianEnabled
        ? 'contrarian'
        : prev.predictorMode,
    }));
    try {
      const res = await apiRequest<{ config: PlatformConfig }>('/api/admin/ai-strategies', {
        method: 'PUT',
        body: JSON.stringify(normalized),
      });
      if (res?.config) {
        setSysConfig(res.config);
        onPlatformConfigChanged?.(res.config);
        setNotice({
          type: 'success',
          text: normalized.allThreeStrategiesActive
            ? 'ALL 3 AI STRATEGIES ACTIVATED simultaneously across KWG Arena!'
            : 'AI Strategy engine configuration updated live.',
        });
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update AI strategy configuration.',
      });
    } finally {
      setSavingStrategies(false);
    }
  };

  const NAV_ITEMS: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'strategies', label: 'AI 3-Strategy Engine', icon: Brain },
    { id: 'users', label: 'Users & Passes', icon: Users },
    { id: 'deposits', label: 'Deposits', icon: IndianRupee },
    { id: 'games', label: 'Games & Embed', icon: Gamepad2 },
    { id: 'payments', label: 'UPI & Payments', icon: CreditCard },
    { id: 'system', label: 'Platform Controls', icon: Settings2 },
  ];

  const revenueBars = useMemo(() => {
    if (!stats) return [];
    const items = [
      {
        label: `${stats.periodLabel} Deposits`,
        value: Math.max(0, stats.periodStats.approvedDepositsAmount),
        color: 'from-[#059669] to-emerald-400',
      },
      {
        label: `${stats.periodLabel} Pending`,
        value: Math.max(0, stats.periodStats.pendingDepositsAmount),
        color: 'from-[#d97706] to-amber-400',
      },
      {
        label: 'Game Revenue',
        value: Math.max(0, stats.overall.paidGameRevenue),
        color: 'from-[#1d4ed8] to-blue-400',
      },
      {
        label: 'All Approved',
        value: Math.max(0, stats.overall.approvedDepositsAmount),
        color: 'from-[#0f1115] to-slate-600',
      },
      {
        label: 'Wallet Float',
        value: Math.max(0, stats.overall.totalWalletBalance),
        color: 'from-indigo-600 to-indigo-400',
      },
    ];
    const peak = Math.max(1, ...items.map((i) => i.value));
    return items.map((i) => ({
      ...i,
      pct: Math.max(10, Math.round((i.value / peak) * 100)),
    }));
  }, [stats]);

  const inputDay =
    'studio-input w-full px-3.5 py-2.5 min-h-[42px] rounded-xl text-sm';

  return (
    <div className="admin-theme-root max-w-7xl mx-auto px-4 py-6 lg:py-8">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Desktop Left Sidebar Rail */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col studio-card rounded-2xl p-4 sticky top-24 space-y-5 animate-fade-up">
          <div className="px-2 pt-1 pb-3 border-b border-[#e6e3da]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#1d4ed8]">
              Command Center
            </div>
            <div className="text-base font-extrabold text-[#0f1115] mt-0.5">Admin Console</div>
            <div className="text-[11px] font-mono text-[#616570] mt-0.5">Auth: 7986911808</div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setNotice(null);
                  }}
                  className={`press-scale w-full min-h-[42px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    active
                      ? 'bg-[#0f1115] text-white font-bold'
                      : 'text-[#525661] hover:text-[#0f1115] hover:bg-[#f6f5f1]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'deposits' && stats && stats.overall.pendingDepositsCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {stats.overall.pendingDepositsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-[#e6e3da] px-2">
            <button
              type="button"
              onClick={() => {
                setTab('games');
                openNewGameForm('embed');
              }}
              className="btn-shine press-scale w-full min-h-[42px] rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-xs font-bold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              Quick Publish Embed
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Mobile Tab Bar */}
          <div className="lg:hidden flex items-center gap-1.5 p-1.5 studio-card rounded-xl overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setNotice(null);
                  }}
                  className={`press-scale px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 min-h-[38px] inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                    tab === item.id
                      ? 'bg-[#0f1115] text-white font-bold'
                      : 'text-[#616570] hover:text-[#0f1115]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {notice && (
            <div
              className={`rounded-xl border px-4 py-3.5 text-sm flex items-center justify-between gap-4 animate-modal-pop ${
                notice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <span>{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs font-bold underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {tab === 'dashboard' && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex p-1.5 studio-card rounded-xl overflow-x-auto">
                  {(
                    [
                      { id: 'today', label: 'Today' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'weekly', label: 'Weekly' },
                      { id: 'monthly', label: 'Monthly' },
                      { id: 'yearly', label: 'Yearly' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPeriod(p.id)}
                      className={`press-scale px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap min-h-[38px] cursor-pointer transition-all ${
                        period === p.id
                          ? 'bg-[#0f1115] text-white font-bold'
                          : 'text-[#616570] hover:text-[#0f1115]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => loadStats(period)}
                  className="press-scale min-h-[42px] px-4 rounded-xl border border-[#e6e3da] bg-white hover:bg-[#eceae3] text-xs font-bold text-[#0f1115] inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#1d4ed8] ${statsLoading ? 'animate-spin' : ''}`} />
                  Refresh Stats
                </button>
              </div>

              {stats && (
                <>
                  <div>
                    <h2 className="text-xs font-bold text-[#616570] uppercase tracking-wider mb-3">
                      {stats.periodLabel} Snapshot
                    </h2>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      <div className="card-lift studio-card rounded-xl p-5 animate-fade-up">
                        <div className="text-xs text-[#616570]">New Users ({stats.periodLabel})</div>
                        <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-[#0f1115]">
                          {stats.periodStats.newUsers}
                        </div>
                      </div>
                      <div
                        className="card-lift studio-card rounded-xl p-5 animate-fade-up"
                        style={{ animationDelay: '40ms' }}
                      >
                        <div className="text-xs text-[#616570]">Approved Deposits</div>
                        <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-[#059669]">
                          {formatCurrency(stats.periodStats.approvedDepositsAmount)}
                        </div>
                        <div className="text-xs text-[#616570] mt-1 font-mono tabular-nums">
                          {stats.periodStats.approvedDepositsCount} approved · {stats.periodStats.pendingDepositsCount} pending
                        </div>
                      </div>
                      <div
                        className="card-lift studio-card rounded-xl p-5 animate-fade-up"
                        style={{ animationDelay: '80ms' }}
                      >
                        <div className="text-xs text-[#616570]">Requested Volume</div>
                        <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-[#0f1115]">
                          {formatCurrency(stats.periodStats.totalDepositsAmount)}
                        </div>
                        <div className="text-xs text-[#616570] mt-1 font-mono tabular-nums">
                          {stats.periodStats.rejectedDepositsCount} rejected ({formatCurrency(stats.periodStats.rejectedDepositsAmount)})
                        </div>
                      </div>
                      <div
                        className="card-lift studio-card rounded-xl p-5 animate-fade-up"
                        style={{ animationDelay: '120ms' }}
                      >
                        <div className="text-xs text-[#616570]">Period Net Flow</div>
                        <div
                          className={`mt-2 text-2xl font-extrabold font-mono tabular-nums ${
                            stats.periodStats.profitLoss >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'
                          }`}
                        >
                          {stats.periodStats.profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(stats.periodStats.profitLoss)}
                        </div>
                        <div className="text-xs text-[#616570] mt-1 font-mono tabular-nums">
                          Paid Rev: {formatCurrency(stats.periodStats.paidGameRevenue)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Liquidity Bar Chart + All-Time Position */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <div className="xl:col-span-8 studio-card rounded-2xl p-6 space-y-5">
                      <div>
                        <h3 className="text-sm font-extrabold text-[#0f1115] flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#1d4ed8]" />
                          Liquidity & Revenue Velocity
                        </h3>
                        <p className="text-xs text-[#616570] mt-0.5">
                          Proportional distribution across deposits, unlocked revenue, and user wallets
                        </p>
                      </div>

                      <div className="h-52 pt-4 flex items-end justify-between gap-3 sm:gap-5 border-b border-[#e6e3da] pb-2">
                        {revenueBars.map((bar, idx) => (
                          <div
                            key={bar.label}
                            className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0"
                          >
                            <span className="text-[10px] font-mono font-bold text-[#0f1115] tabular-nums truncate max-w-full">
                              {formatCurrency(bar.value)}
                            </span>
                            <div className="w-full max-w-[56px] flex-1 flex items-end">
                              <div
                                className={`w-full rounded-t-xl bg-gradient-to-t ${bar.color} animate-bar-grow`}
                                style={{
                                  height: `${bar.pct}%`,
                                  animationDelay: `${idx * 75}ms`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-start justify-between gap-3 sm:gap-5 text-center">
                        {revenueBars.map((bar) => (
                          <div key={bar.label} className="flex-1 text-[11px] font-semibold text-[#616570] truncate">
                            {bar.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="xl:col-span-4 ink-card rounded-2xl p-6 text-white flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-300">All-Time Net Position</h3>
                        <div
                          className={`mt-3 text-3xl font-extrabold font-mono tabular-nums ${
                            stats.overall.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {stats.overall.profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(stats.overall.profitLoss)}
                        </div>
                        <div className="mt-4 space-y-1.5 text-xs text-slate-400 font-mono">
                          <div className="flex justify-between">
                            <span>Registered Users:</span>
                            <span className="text-white font-bold">{stats.overall.totalUsers}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Active / Banned:</span>
                            <span className="text-white font-bold">
                              {stats.overall.activeUsers} / {stats.overall.bannedUsers}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pending Queue:</span>
                            <span className="text-amber-300 font-bold">
                              {stats.overall.pendingDepositsCount} ({formatCurrency(stats.overall.pendingDepositsAmount)})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setTab('strategies')}
                          className="btn-shine press-scale w-full min-h-[42px] rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white text-xs font-extrabold cursor-pointer"
                        >
                          AI 3-Strategy Engine &amp; Live Dashboard
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab('deposits')}
                          className="btn-shine press-scale w-full min-h-[42px] rounded-xl bg-[#d97706] hover:bg-[#b45309] text-white text-xs font-bold cursor-pointer"
                        >
                          Review Pending Deposits ({stats.overall.pendingDepositsCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab('system')}
                          className="press-scale w-full min-h-[42px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold cursor-pointer"
                        >
                          Configure Pricing &amp; Platform Controls
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: AI 3-STRATEGY ENGINE & COMBINED DASHBOARD */}
          {tab === 'strategies' && (
            <div className="space-y-6 animate-fade-up">
              <AdminCombinedAiDashboard
                strategyConfig={normalizeStrategyConfig(
                  sysConfig.strategyConfig,
                  sysConfig.predictorMode
                )}
                savingStrategies={savingStrategies}
                onUpdateStrategies={handleUpdateAiStrategies}
              />
            </div>
          )}

          {/* TAB 2: USERS, PASSES & BANS */}
          {tab === 'users' && (
            <div className="space-y-6 animate-fade-up">
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#616570] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loadUsers(userSearch, aiFilter);
                      }}
                      placeholder="Search by username, registered mobile number, UID, or email..."
                      className="w-full pl-10 pr-4 py-2.5 min-h-[44px] studio-card rounded-xl text-sm text-[#0f1115] placeholder:text-[#8b8e98] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadUsers(userSearch, aiFilter)}
                    className="btn-shine press-scale min-h-[44px] px-5 rounded-xl bg-[#0f1115] hover:bg-[#1e222b] text-white text-xs font-bold cursor-pointer"
                  >
                    Sync List
                  </button>
                </div>

                {/* AI PASS Membership Filter Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex flex-wrap items-center gap-1.5 p-1 studio-card rounded-xl">
                    {(
                      [
                        {
                          id: 'all',
                          label: `All Players (${aiPassStats?.totalUsers ?? users.length})`,
                        },
                        {
                          id: 'active',
                          label: `Active AI PASS Members (${aiPassStats?.activeCount ?? users.filter((u) => isUserAiPassUnlocked(u, nowTick)).length})`,
                        },
                        {
                          id: 'expired',
                          label: `Expired / Free (${aiPassStats ? aiPassStats.expiredCount + aiPassStats.freeCount : users.filter((u) => !isUserAiPassUnlocked(u, nowTick)).length})`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAiFilter(f.id)}
                        className={`press-scale px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                          aiFilter === f.id
                            ? 'bg-[#0f1115] text-white'
                            : 'text-[#616570] hover:text-[#0f1115]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {aiPassStats && (
                    <div className="text-xs font-mono text-[#616570]">
                      Active VIP: <strong className="text-amber-600">{aiPassStats.activeCount}</strong> · Expired:{' '}
                      <strong>{aiPassStats.expiredCount}</strong> · Free: <strong>{aiPassStats.freeCount}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div
                  className={`${
                    selectedUser ? 'xl:col-span-7' : 'xl:col-span-12'
                  } studio-card rounded-2xl overflow-hidden`}
                >
                  <div className="px-5 py-4 border-b border-[#e6e3da] flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-[#0f1115]">Registered Players</h2>
                    <span className="text-xs text-[#616570] font-mono tabular-nums">
                      {usersLoading ? 'Loading...' : `${filteredUsers.length} users`}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-[#f6f5f1] border-b border-[#e6e3da] text-[#616570] text-xs">
                        <tr>
                          <th className="py-3 px-4 font-bold">UID / User</th>
                          <th className="py-3 px-4 font-bold">Mobile / AI PASS Expiry</th>
                          <th className="py-3 px-4 font-bold text-right">Wallet</th>
                          <th className="py-3 px-4 font-bold">Status</th>
                          <th className="py-3 px-4 font-bold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#efede7]">
                        {filteredUsers.map((u) => {
                          const hasNum = isFeatureUnlocked(u.numberPredExpiresAt, nowTick);
                          const hasCol = isFeatureUnlocked(u.colorPredExpiresAt, nowTick);
                          const hasAi = isUserAiPassUnlocked(u, nowTick);
                          const aiWasGranted = Boolean(u.aiPredExpiresAt);
                          return (
                            <tr
                              key={u.id}
                              className={`studio-row-hover transition-colors ${
                                selectedUser?.id === u.id ? 'bg-blue-500/10' : ''
                              }`}
                            >
                              <td className="py-3 px-4">
                                <div className="font-mono font-bold">UID {u.uid}</div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="text-xs font-semibold text-[#0f1115]">{u.username}</span>
                                  <AiPassBadge active={hasAi} size="xs" />
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-mono font-semibold">{u.phone}</div>
                                <div className="text-[11px] text-[#616570] mt-0.5">
                                  {hasAi ? (
                                    <span className="text-emerald-700 font-bold">
                                      {u.isAdmin
                                        ? 'Admin AI PASS'
                                        : `AI Active · ${formatRemainingDuration(u.aiPredExpiresAt, nowTick)} (${formatDateTime(u.aiPredExpiresAt || '')})`}
                                    </span>
                                  ) : aiWasGranted ? (
                                    <span className="text-rose-600 font-semibold">
                                      AI Expired ({formatDateTime(u.aiPredExpiresAt || '')})
                                    </span>
                                  ) : (
                                    <span>No AI PASS</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#8b8e98] mt-0.5">
                                  {hasNum ? 'Num ✓' : 'Num Locked'} · {hasCol ? 'Color ✓' : 'Color Locked'}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-[#059669]">
                                {formatCurrency(u.walletBalance)}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-bold text-xs ${
                                    u.status === 'banned' ? 'text-[#dc2626]' : 'text-[#059669]'
                                  }`}
                                >
                                  {u.status === 'banned' ? 'Banned' : 'Active'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => inspectUser(u.id)}
                                  className="press-scale min-h-[36px] px-3 rounded-lg border border-[#e6e3da] bg-white hover:bg-[#f6f5f1] text-xs font-bold text-[#0f1115] cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedUser && (
                  <div className="xl:col-span-5 studio-card rounded-2xl p-5 space-y-6 animate-slide-right">
                    <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#e6e3da]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-base font-extrabold text-[#0f1115]">
                          <span>{selectedUser.username}</span>
                          <AiPassBadge active={isUserAiPassUnlocked(selectedUser, nowTick)} size="sm" />
                          <span className="font-mono text-[#1d4ed8] text-sm">UID {selectedUser.uid}</span>
                        </div>
                        <div className="text-xs text-[#616570] mt-0.5">
                          {selectedUser.phone} · {selectedUser.email}
                        </div>
                        <div className="text-xs text-[#8b8e98] mt-0.5">
                          Registered {formatDateTime(selectedUser.createdAt)}
                        </div>
                        {selectedUser.deviceId && (
                          <div className="text-[11px] font-mono text-[#616570] mt-0.5">
                            Device ID: {selectedUser.deviceId}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg capitalize shrink-0 ${
                          selectedUser.status === 'banned'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {selectedUser.status}
                      </span>
                    </div>

                    {/* Complete AI PASS Membership & Prediction Pass Control */}
                    <div className="space-y-3 pb-5 border-b border-[#e6e3da]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-extrabold text-[#0f1115] inline-flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-[#d97706]" />
                          AI PASS Membership &amp; Passes
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[#616570]">Hours:</span>
                          <input
                            type="number"
                            min="1"
                            max="87600"
                            value={passHours}
                            onChange={(e) => setPassHours(e.target.value)}
                            className="w-20 px-2 py-1 bg-[#f6f5f1] border border-[#e6e3da] rounded-lg text-xs font-mono text-center text-[#0f1115]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {(() => {
                          const hasAi = isUserAiPassUnlocked(selectedUser, nowTick);
                          const hasExpiryTs = Boolean(selectedUser.aiPredExpiresAt);
                          return (
                            <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-3.5 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-extrabold text-[#0f1115] inline-flex items-center gap-1.5">
                                  <Brain className="w-4 h-4 text-[#1d4ed8]" />
                                  AI PASS Membership
                                </span>
                                <span
                                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                    hasAi
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : hasExpiryTs
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {selectedUser.isAdmin
                                    ? 'ADMIN PERMANENT'
                                    : hasAi
                                    ? `ACTIVE · ${formatRemainingDuration(selectedUser.aiPredExpiresAt, nowTick)}`
                                    : hasExpiryTs
                                    ? 'EXPIRED'
                                    : 'NOT ACTIVE'}
                                </span>
                              </div>

                              <div className="text-[11px] font-mono text-[#525661]">
                                Expiry Date:{' '}
                                <strong>
                                  {selectedUser.aiPredExpiresAt
                                    ? formatDateTime(selectedUser.aiPredExpiresAt)
                                    : selectedUser.isAdmin
                                    ? 'Permanent Admin Access'
                                    : 'None'}
                                </strong>
                              </div>

                              {/* Preset Durations */}
                              <div className="grid grid-cols-5 gap-1.5">
                                {[
                                  { h: 24, label: '+24h' },
                                  { h: 168, label: '+7d' },
                                  { h: 360, label: '+15d' },
                                  { h: 720, label: '+30d' },
                                  { h: 8760, label: '+1y' },
                                ].map((preset) => (
                                  <button
                                    key={preset.h}
                                    type="button"
                                    onClick={() => handlePredictionPass('ai', 'grant', preset.h)}
                                    className="min-h-[32px] rounded-lg bg-white hover:bg-[#e8effe] border border-[#d9deea] text-[11px] font-mono font-bold text-[#1d4ed8] cursor-pointer"
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePredictionPass('ai', 'grant')}
                                  className="flex-1 min-h-[36px] rounded-lg bg-[#0f1115] hover:bg-[#1e222b] text-white text-xs font-bold cursor-pointer"
                                >
                                  {hasAi ? `+ Extend ${passHours || 24}h` : `Activate ${passHours || 24}h AI PASS`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePredictionPass('ai', 'revoke')}
                                  className="min-h-[36px] px-3 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-700 cursor-pointer"
                                >
                                  Remove AI PASS
                                </button>
                              </div>

                              {/* Custom Expiry Date/Time Setter */}
                              <div className="pt-2 border-t border-[#e6e3da] space-y-2">
                                <label className="block text-[11px] font-bold text-[#3f4450]">
                                  Set Custom Expiry Date &amp; Time
                                </label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input
                                    type="datetime-local"
                                    value={customAiExpiryInput}
                                    onChange={(e) => setCustomAiExpiryInput(e.target.value)}
                                    className="flex-1 min-h-[36px] px-2.5 py-1.5 bg-white border border-[#d9deea] rounded-lg text-xs font-mono text-[#0f1115]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handlePredictionPass('ai', 'set_expiry')}
                                    className="min-h-[36px] px-3 rounded-lg bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                                  >
                                    Set Expiry
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold inline-flex items-center gap-1 text-[#0f1115]">
                                <Hash className="w-3.5 h-3.5 text-[#d97706]" />
                                Number (0–9)
                              </span>
                              <span className="font-mono text-[11px] text-[#616570]">
                                {formatRemainingDuration(selectedUser.numberPredExpiresAt, nowTick)}
                              </span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePredictionPass('number', 'grant')}
                                className="flex-1 min-h-[34px] rounded-lg bg-[#d97706] hover:bg-[#b45309] text-white text-[11px] font-bold cursor-pointer"
                              >
                                + Grant {passHours || 24}h
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePredictionPass('number', 'revoke')}
                                className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#e6e3da] hover:bg-rose-50 text-[11px] font-semibold text-rose-600 cursor-pointer"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold inline-flex items-center gap-1 text-[#0f1115]">
                                <Palette className="w-3.5 h-3.5 text-[#1d4ed8]" />
                                Color Pass
                              </span>
                              <span className="font-mono text-[11px] text-[#616570]">
                                {formatRemainingDuration(selectedUser.colorPredExpiresAt, nowTick)}
                              </span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePredictionPass('color', 'grant')}
                                className="flex-1 min-h-[34px] rounded-lg bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-[11px] font-bold cursor-pointer"
                              >
                                + Grant {passHours || 24}h
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePredictionPass('color', 'revoke')}
                                className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#e6e3da] hover:bg-rose-50 text-[11px] font-semibold text-rose-600 cursor-pointer"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Wallet Management */}
                    <form onSubmit={handleWalletAdjust} className="space-y-3 pb-5 border-b border-[#e6e3da]">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-extrabold text-[#0f1115] inline-flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-[#059669]" />
                          Wallet Management
                        </div>
                        <span className="text-sm font-mono font-bold tabular-nums text-[#059669]">
                          {formatCurrency(selectedUser.walletBalance)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setWalletAction('credit')}
                          className={`min-h-[40px] rounded-xl text-xs font-bold border cursor-pointer ${
                            walletAction === 'credit'
                              ? 'bg-[#059669] text-white border-[#059669]'
                              : 'bg-[#f6f5f1] text-[#3f4450] border-[#e6e3da]'
                          }`}
                        >
                          + Add Funds
                        </button>
                        <button
                          type="button"
                          onClick={() => setWalletAction('debit')}
                          className={`min-h-[40px] rounded-xl text-xs font-bold border cursor-pointer ${
                            walletAction === 'debit'
                              ? 'bg-[#dc2626] text-white border-[#dc2626]'
                              : 'bg-[#f6f5f1] text-[#3f4450] border-[#e6e3da]'
                          }`}
                        >
                          − Deduct Funds
                        </button>
                      </div>
                      <input
                        type="number"
                        required
                        min="1"
                        step="0.01"
                        value={walletAmt}
                        onChange={(e) => setWalletAmt(e.target.value)}
                        placeholder="Amount (INR)"
                        className={`${inputDay} font-mono tabular-nums`}
                      />
                      <input
                        type="text"
                        value={walletNote}
                        onChange={(e) => setWalletNote(e.target.value)}
                        placeholder="Reason / notice for user history (optional)"
                        className={inputDay}
                      />
                      <button
                        type="submit"
                        className="btn-shine press-scale w-full min-h-[42px] rounded-xl bg-[#0f1115] hover:bg-[#1e222b] text-white text-xs font-bold cursor-pointer"
                      >
                        Apply Wallet Adjustment
                      </button>
                    </form>

                    {/* Ban / Unban Controls */}
                    {selectedUser.status === 'banned' ? (
                      <div className="space-y-3 pb-5 border-b border-[#e6e3da]">
                        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                          <div className="font-bold">Banned · {selectedUser.banReason}</div>
                          <div>{selectedUser.banNotice}</div>
                          <div className="font-mono text-[11px] text-rose-700 pt-1">
                            {selectedUser.banExpiresAt
                              ? `Expires: ${formatDateTime(selectedUser.banExpiresAt)}`
                              : 'Duration: Permanent Ban'}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={unbanNote}
                          onChange={(e) => setUnbanNote(e.target.value)}
                          placeholder="Optional restoration notice for user history"
                          className={inputDay}
                        />
                        <button
                          type="button"
                          onClick={handleUnbanUser}
                          className="btn-shine press-scale w-full min-h-[44px] rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Unban User Account
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleBanUser} className="space-y-3 pb-5 border-b border-[#e6e3da]">
                        <div className="text-sm font-extrabold text-[#dc2626] inline-flex items-center gap-1.5">
                          <ShieldBan className="w-4 h-4" />
                          Ban User Account
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setBanMode('prefilled')}
                            className={`min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer ${
                              banMode === 'prefilled'
                                ? 'bg-[#0f1115] text-white border-[#0f1115]'
                                : 'bg-[#f6f5f1] text-[#3f4450] border-[#e6e3da]'
                            }`}
                          >
                            Prefilled Notice (10)
                          </button>
                          <button
                            type="button"
                            onClick={() => setBanMode('custom')}
                            className={`min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer ${
                              banMode === 'custom'
                                ? 'bg-[#0f1115] text-white border-[#0f1115]'
                                : 'bg-[#f6f5f1] text-[#3f4450] border-[#e6e3da]'
                            }`}
                          >
                            Custom Notice
                          </button>
                        </div>

                        {/* Ban Duration Selector: Permanent vs Custom Hours */}
                        <div className="p-3 rounded-xl bg-[#f6f5f1] border border-[#e6e3da] space-y-2.5">
                          <div className="text-[11px] font-bold text-[#3f4450] uppercase tracking-wider">
                            Ban Duration
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setBanDurationMode('permanent')}
                              className={`min-h-[36px] rounded-lg text-xs font-bold border cursor-pointer ${
                                banDurationMode === 'permanent'
                                  ? 'bg-[#dc2626] text-white border-[#dc2626]'
                                  : 'bg-white text-[#3f4450] border-[#e6e3da]'
                              }`}
                            >
                              Permanent Ban
                            </button>
                            <button
                              type="button"
                              onClick={() => setBanDurationMode('timed')}
                              className={`min-h-[36px] rounded-lg text-xs font-bold border cursor-pointer ${
                                banDurationMode === 'timed'
                                  ? 'bg-[#d97706] text-white border-[#d97706]'
                                  : 'bg-white text-[#3f4450] border-[#e6e3da]'
                              }`}
                            >
                              Custom Time (Hours)
                            </button>
                          </div>
                          {banDurationMode === 'timed' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-4 gap-1.5">
                                {[
                                  { h: '1', label: '1h' },
                                  { h: '24', label: '24h' },
                                  { h: '168', label: '7d' },
                                  { h: '720', label: '30d' },
                                ].map((p) => (
                                  <button
                                    key={p.h}
                                    type="button"
                                    onClick={() => setBanDurationHours(p.h)}
                                    className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border cursor-pointer ${
                                      banDurationHours === p.h
                                        ? 'bg-[#0f1115] text-white border-[#0f1115]'
                                        : 'bg-white text-[#3f4450] border-[#e6e3da]'
                                    }`}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="87600"
                                  value={banDurationHours}
                                  onChange={(e) => setBanDurationHours(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-[#e6e3da] rounded-lg text-xs font-mono text-[#0f1115]"
                                  placeholder="Custom hours"
                                />
                                <span className="text-xs font-semibold text-[#616570] shrink-0">
                                  hours
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {banMode === 'prefilled' ? (
                          <div className="space-y-2">
                            <select
                              value={selectedPrefilledId}
                              onChange={(e) => setSelectedPrefilledId(e.target.value)}
                              className="w-full px-3 py-2.5 min-h-[42px] bg-[#f6f5f1] border border-[#e6e3da] rounded-xl text-xs font-semibold text-[#0f1115]"
                            >
                              {banNotices.map((bn, idx) => (
                                <option key={bn.id} value={bn.id}>
                                  {idx + 1}. {bn.reason}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const found = banNotices.find((b) => b.id === selectedPrefilledId);
                              return found ? (
                                <div className="p-3 rounded-xl bg-[#f6f5f1] border border-[#e6e3da] text-xs text-[#3f4450]">
                                  {found.notice}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input
                              type="text"
                              required
                              value={customBanReason}
                              onChange={(e) => setCustomBanReason(e.target.value)}
                              placeholder="Ban reason (e.g. Rule Violation)"
                              className={inputDay}
                            />
                            <textarea
                              required
                              rows={3}
                              value={customBanNotice}
                              onChange={(e) => setCustomBanNotice(e.target.value)}
                              placeholder="Write custom notice message displayed to banned user..."
                              className="w-full px-3.5 py-2 bg-[#f6f5f1] border border-[#e6e3da] rounded-xl text-sm text-[#0f1115] placeholder:text-[#8b8e98]"
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          className="press-scale w-full min-h-[44px] rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold cursor-pointer"
                        >
                          {banDurationMode === 'timed'
                            ? `Ban User for ${banDurationHours || 24}h`
                            : 'Confirm Permanent Ban'}
                        </button>
                      </form>
                    )}

                    {/* Delete User Permanently */}
                    {!selectedUser.isAdmin && (
                      <div className="space-y-2.5 pb-5 border-b border-[#e6e3da]">
                        <div className="text-xs font-extrabold text-rose-700 uppercase tracking-wider">
                          Danger Zone · Delete Player
                        </div>
                        {confirmDeleteUserId === selectedUser.id ? (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-2.5">
                            <div className="text-xs font-semibold text-rose-800">
                              Delete UID {selectedUser.uid} ({selectedUser.phone}) and all transactions forever?
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="min-h-[40px] rounded-lg bg-white border border-[#e6e3da] text-xs font-bold text-[#3f4450] cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(selectedUser)}
                                className="min-h-[40px] rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Forever
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUserId(selectedUser.id)}
                            className="press-scale w-full min-h-[42px] rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete User Account
                          </button>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-bold text-[#3f4450] mb-2">Recent User Activity</div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-[#efede7] border border-[#e6e3da] rounded-xl bg-[#f6f5f1]">
                        {selectedUserHistory.length === 0 ? (
                          <div className="p-4 text-xs text-[#616570] text-center">No activity logged.</div>
                        ) : (
                          selectedUserHistory.slice(0, 10).map((item) => (
                            <div key={item.id} className="p-3 text-xs">
                              <div className="font-bold text-[#0f1115]">{item.title}</div>
                              <div className="text-[#616570] mt-0.5">{formatDateTime(item.created_at)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteUserId(null);
                        setSelectedUser(null);
                      }}
                      className="press-scale w-full min-h-[46px] rounded-xl bg-[#f6f5f1] hover:bg-[#eae7df] border border-[#e6e3da] text-sm font-bold text-[#0f1115] cursor-pointer"
                    >
                      Close Player Details
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DEPOSITS */}
          {tab === 'deposits' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-1.5 studio-card rounded-xl">
                  {(['pending', 'completed', 'rejected', 'all'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDepositFilter(s)}
                      className={`press-scale px-4 py-2 text-xs font-semibold rounded-lg capitalize min-h-[38px] cursor-pointer ${
                        depositFilter === s
                          ? 'ink-btn font-bold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => loadDeposits(depositFilter)}
                  className="press-scale min-h-[42px] px-4 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent-primary)] ${depositsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="studio-card rounded-2xl overflow-hidden">
                {deposits.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[var(--text-secondary)]">
                    No {depositFilter !== 'all' ? depositFilter : ''} deposit requests found.
                  </div>
                ) : (
                  <div className="divide-y studio-divider">
                    {deposits.map((dep, idx) => {
                      const customDraft =
                        depositCustomStatuses[dep.id] !== undefined
                          ? depositCustomStatuses[dep.id]
                          : dep.custom_status || '';
                      const displayLabel = dep.custom_status?.trim()
                        ? dep.custom_status.trim()
                        : dep.status;
                      return (
                        <div
                          key={dep.id}
                          className="p-5 flex flex-col gap-4 studio-row-hover transition-colors animate-fade-up"
                          style={{ animationDelay: `${Math.min(idx * 25, 200)}ms` }}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-sm">
                                  {dep.reference_id}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">
                                  · UID {dep.user_uid} ({dep.user_name} · {dep.user_phone})
                                </span>
                              </div>
                              <div className="text-xs text-[var(--text-secondary)]">
                                UTR: <strong className="font-mono text-[var(--text-primary)]">{dep.utr}</strong> · UPI: {dep.upi_id} ·{' '}
                                {formatDateTime(dep.created_at)}
                              </div>
                              {dep.admin_notice && (
                                <div className="text-xs studio-muted border rounded-lg px-3 py-1.5 inline-block mt-1">
                                  Notice: {dep.admin_notice}
                                </div>
                              )}
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                              <div className="text-lg font-extrabold font-mono tabular-nums">
                                {formatCurrency(dep.amount)}
                              </div>
                              <div
                                className={`text-xs font-bold mt-0.5 capitalize ${
                                  dep.status === 'completed'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : dep.status === 'rejected'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : dep.custom_status?.trim()
                                    ? 'text-[var(--accent-primary)]'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {displayLabel}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 pt-2 border-t studio-divider">
                            <input
                              type="text"
                              maxLength={60}
                              value={customDraft}
                              onChange={(e) =>
                                setDepositCustomStatuses((prev) => ({
                                  ...prev,
                                  [dep.id]: e.target.value,
                                }))
                              }
                              placeholder="Custom status words (e.g. Checking Bank, Hold 5 Min, Verified)..."
                              className="studio-input px-3 py-2 min-h-[40px] rounded-xl text-xs flex-1"
                            />
                            <input
                              type="text"
                              value={
                                depositNotes[dep.id] !== undefined
                                  ? depositNotes[dep.id]
                                  : dep.admin_notice || ''
                              }
                              onChange={(e) =>
                                setDepositNotes((prev) => ({ ...prev, [dep.id]: e.target.value }))
                              }
                              placeholder="Optional admin notice..."
                              className="studio-input px-3 py-2 min-h-[40px] rounded-xl text-xs lg:w-52"
                            />
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleReviewDeposit(dep.id, 'custom')}
                                className="press-scale min-h-[40px] px-3.5 rounded-xl accent-btn text-xs font-bold cursor-pointer"
                              >
                                Set Status
                              </button>
                              {dep.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewDeposit(dep.id, 'completed')}
                                    className="btn-shine press-scale min-h-[40px] px-4 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewDeposit(dep.id, 'rejected')}
                                    className="press-scale min-h-[40px] px-4 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: GAMES, UNIVERSAL UPLOADER, QUICK EMBED & MOD DESIGNER */}
          {tab === 'games' && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[#0f1115]">Game Publisher & Mod Menu Designer</h2>
                  <p className="text-xs text-[#616570]">
                    Publish via Quick Embed URL or upload any HTML/CSS/JS source code, and customize which Mod Menu attaches to each game.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRestoreDefaultKwg}
                    className="press-scale min-h-[44px] px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore KWG Original
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewGameForm('embed')}
                    className="btn-shine press-scale min-h-[44px] px-4 rounded-xl bg-[#0f1115] hover:bg-[#1e222b] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    Quick Embed URL
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewGameForm('source')}
                    className="btn-shine press-scale min-h-[44px] px-4 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Code2 className="w-4 h-4" />
                    Upload Source Code
                  </button>
                </div>
              </div>

              {showGameForm && (
                <form
                  onSubmit={handleSaveGame}
                  className="studio-card rounded-2xl p-6 space-y-6 animate-modal-pop"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#e6e3da]">
                    <div>
                      <h3 className="text-base font-extrabold text-[#0f1115]">
                        {editingGame ? `Edit Game · ${editingGame.name}` : 'Publish New Game'}
                      </h3>
                      <p className="text-xs text-[#616570] mt-0.5">
                        Choose Quick Embed URL or Source Code Upload, then select the Mod Menu design below.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingGame?.is_default === 1 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await handleRestoreDefaultKwg();
                            setShowGameForm(false);
                          }}
                          className="min-h-[36px] px-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore Original KWG
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Publish Mode Switcher */}
                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#f6f5f1] border border-[#e6e3da] rounded-xl max-w-md">
                    <button
                      type="button"
                      onClick={() => setGameMode('embed')}
                      className={`min-h-[42px] px-4 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        gameMode === 'embed'
                          ? 'bg-[#0f1115] text-white'
                          : 'text-[#616570] hover:text-[#0f1115]'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      Embed Game Link (Easy)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGameMode('source')}
                      className={`min-h-[42px] px-4 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        gameMode === 'source'
                          ? 'bg-[#1d4ed8] text-white'
                          : 'text-[#616570] hover:text-[#0f1115]'
                      }`}
                    >
                      <Code2 className="w-4 h-4" />
                      Source Code (HTML/CSS/JS)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                        Game Name (Short) *
                      </label>
                      <input
                        type="text"
                        required
                        value={gameName}
                        onChange={(e) => setGameName(e.target.value)}
                        placeholder="e.g. Raja Luck"
                        className={inputDay}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                        Display Title {gameMode === 'embed' ? '(Optional — defaults to Name)' : ''}
                      </label>
                      <input
                        type="text"
                        value={gameTitle}
                        onChange={(e) => setGameTitle(e.target.value)}
                        placeholder="e.g. Raja Luck — Wingo 1M VIP"
                        className={inputDay}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                      Description (Optional — auto-filled if blank)
                    </label>
                    <textarea
                      rows={2}
                      value={gameDesc}
                      onChange={(e) => setGameDesc(e.target.value)}
                      placeholder="Describe gameplay, rules, and highlights..."
                      className="w-full px-3.5 py-2 bg-[#f6f5f1] border border-[#e6e3da] rounded-xl text-sm text-[#0f1115] placeholder:text-[#8b8e98]"
                    />
                  </div>

                  {gameMode === 'embed' ? (
                    <div className="rounded-xl border border-[#e6e3da] bg-[#f6f5f1] p-4 sm:p-5 space-y-3">
                      <div>
                        <div className="text-sm font-bold text-[#0f1115]">Embed Website / Game URL</div>
                        <p className="text-xs text-[#616570]">
                          Paste any https:// game URL, pick your Mod Menu design below, and click Submit & Publish.
                        </p>
                      </div>
                      <input
                        type="url"
                        required
                        value={embedUrl}
                        onChange={(e) => setEmbedUrl(e.target.value)}
                        placeholder="https://example-game.com/#/register?invitationCode=..."
                        className="w-full px-4 py-3 min-h-[46px] bg-white border border-[#e6e3da] rounded-xl text-sm font-mono text-[#0f1115] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-xl border border-[#e6e3da] bg-[#f6f5f1] p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#e6e3da]">
                        <div>
                          <div className="text-sm font-bold text-[#0f1115]">Universal Source Code Uploader</div>
                          <p className="text-xs text-[#616570]">
                            Upload single-file .html games, separate .html + .css + .js bundles, or paste any code directly.
                          </p>
                        </div>
                        <label className="btn-shine press-scale min-h-[40px] px-4 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0">
                          <Upload className="w-4 h-4" />
                          Upload Any Files (.html / .css / .js)
                          <input
                            type="file"
                            multiple
                            accept=".html,.htm,.css,.js,.mjs,text/html,text/css,text/javascript"
                            onChange={handleSmartFilesUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-[#3f4450]">
                            HTML Code (Full document or body markup — optional if JS/CSS provided)
                          </label>
                          <label className="text-xs font-bold text-[#1d4ed8] hover:underline cursor-pointer">
                            Upload .html file
                            <input
                              type="file"
                              accept=".html,.htm,text/html"
                              onChange={(e) => handleFileRead(e, setGameHtml)}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <textarea
                          rows={6}
                          value={gameHtml}
                          onChange={(e) => setGameHtml(e.target.value)}
                          placeholder="<!DOCTYPE html><html>...</html> or <canvas id='game'></canvas>"
                          className="w-full px-3.5 py-2.5 border border-[#e6e3da] rounded-xl text-xs font-mono bg-white text-[#0f1115]"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-[#3f4450]">CSS Code (Optional)</label>
                            <label className="text-xs font-bold text-[#1d4ed8] hover:underline cursor-pointer">
                              Upload .css file
                              <input
                                type="file"
                                accept=".css,text/css"
                                onChange={(e) => handleFileRead(e, setGameCss)}
                                className="hidden"
                              />
                            </label>
                          </div>
                          <textarea
                            rows={5}
                            value={gameCss}
                            onChange={(e) => setGameCss(e.target.value)}
                            placeholder="body { ... }"
                            className="w-full px-3.5 py-2.5 border border-[#e6e3da] rounded-xl text-xs font-mono bg-white text-[#0f1115]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-[#3f4450]">JavaScript Code (Optional)</label>
                            <label className="text-xs font-bold text-[#1d4ed8] hover:underline cursor-pointer">
                              Upload .js file
                              <input
                                type="file"
                                accept=".js,.mjs,text/javascript,application/javascript"
                                onChange={(e) => handleFileRead(e, setGameJs)}
                                className="hidden"
                              />
                            </label>
                          </div>
                          <textarea
                            rows={5}
                            value={gameJs}
                            onChange={(e) => setGameJs(e.target.value)}
                            placeholder="/* Any JavaScript game logic */"
                            className="w-full px-3.5 py-2.5 border border-[#e6e3da] rounded-xl text-xs font-mono bg-white text-[#0f1115]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mod Menu Selector & Design Customizer */}
                  {(() => {
                    const previewTheme = resolveMenuTheme(
                      modMenuConfig,
                      gameName || 'Preview Game',
                      editingGame?.slug || 'custom'
                    );
                    return (
                      <div className="rounded-xl border border-[#e6e3da] p-4 sm:p-5 space-y-5 bg-[#f6f5f1]">
                        <div className="flex items-center justify-between gap-3 border-b border-[#e6e3da] pb-3">
                          <div className="flex items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-[#1d4ed8]" />
                            <div>
                              <h4 className="text-sm font-extrabold text-[#0f1115]">
                                Mod Menu Selector & Design
                              </h4>
                              <p className="text-xs text-[#616570]">
                                Pick which Mod Menu layout, colors, and features attach to this game.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                          <div className="lg:col-span-7 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                                  Mod Menu Type
                                </label>
                                <select
                                  value={modMenuConfig.enabled ? modMenuConfig.menuType : 'none'}
                                  onChange={(e) => {
                                    const val = e.target.value as 'wingo-full' | 'compact-hud' | 'none';
                                    setModMenuConfig((prev) => ({
                                      ...prev,
                                      enabled: val !== 'none',
                                      menuType: val,
                                    }));
                                  }}
                                  className="w-full px-3.5 py-2.5 min-h-[42px] border border-[#e6e3da] rounded-xl text-xs font-bold bg-white text-[#0f1115]"
                                >
                                  <option value="wingo-full">Full VIP Mod Menu (Scanner + Split + History)</option>
                                  <option value="compact-hud">Compact Predictor HUD Only</option>
                                  <option value="none">No Mod Menu (Pure Game Only)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                                  Period & Trend Clock
                                </label>
                                <select
                                  value={modMenuConfig.clockMode}
                                  onChange={(e) =>
                                    setModMenuConfig((prev) => ({
                                      ...prev,
                                      clockMode:
                                        e.target.value === 'ist-standard'
                                          ? 'ist-standard'
                                          : 'utc-partner-api',
                                    }))
                                  }
                                  className="w-full px-3.5 py-2.5 min-h-[42px] border border-[#e6e3da] rounded-xl text-xs font-bold bg-white text-[#0f1115]"
                                >
                                  <option value="utc-partner-api">Partner Wingo 1M (Live BDG API · UTC 10001)</option>
                                  <option value="ist-standard">Standard KWG Wingo 1M (IST)</option>
                                </select>
                              </div>
                            </div>

                            {modMenuConfig.enabled && (
                              <>
                                <div>
                                  <label className="block text-xs font-bold text-[#3f4450] mb-2">
                                    Mod Menu Color & Design Preset
                                  </label>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(
                                      Object.keys(MOD_MENU_PRESETS) as Array<
                                        Exclude<ModMenuStyle, 'custom'>
                                      >
                                    ).map((key) => {
                                      const preset = MOD_MENU_PRESETS[key];
                                      const selected = modMenuConfig.themePreset === key;
                                      return (
                                        <button
                                          key={key}
                                          type="button"
                                          onClick={() =>
                                            setModMenuConfig((prev) => ({
                                              ...prev,
                                              themePreset: key,
                                            }))
                                          }
                                          className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                                            selected
                                              ? 'border-[#1d4ed8] bg-white ring-2 ring-[#1d4ed8]/25'
                                              : 'border-[#e6e3da] bg-white hover:border-[#c8c3b6]'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span
                                              className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/15"
                                              style={{ background: preset.tabGradient }}
                                            />
                                            <span className="text-[11px] font-bold text-[#0f1115] truncate">
                                              {preset.name.split(' (')[0]}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setModMenuConfig((prev) => ({
                                          ...prev,
                                          themePreset: 'custom',
                                        }))
                                      }
                                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                                        modMenuConfig.themePreset === 'custom'
                                          ? 'border-[#1d4ed8] bg-white ring-2 ring-[#1d4ed8]/25'
                                          : 'border-[#e6e3da] bg-white hover:border-[#c8c3b6]'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/15"
                                          style={{
                                            background: `linear-gradient(135deg, ${modMenuConfig.customAccent || '#00f2ff'}, ${modMenuConfig.customSecondaryAccent || '#9d4edd'})`,
                                          }}
                                        />
                                        <span className="text-[11px] font-bold text-[#0f1115]">
                                          Custom Colors
                                        </span>
                                      </div>
                                    </button>
                                  </div>
                                </div>

                                {modMenuConfig.themePreset === 'custom' && (
                                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white border border-[#e6e3da]">
                                    <label className="flex items-center justify-between gap-2 text-xs font-bold text-[#3f4450]">
                                      <span>Primary Accent</span>
                                      <input
                                        type="color"
                                        value={modMenuConfig.customAccent || '#00f2ff'}
                                        onChange={(e) =>
                                          setModMenuConfig((prev) => ({
                                            ...prev,
                                            customAccent: e.target.value,
                                          }))
                                        }
                                        className="w-10 h-8 rounded cursor-pointer border-0 bg-transparent"
                                      />
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-xs font-bold text-[#3f4450]">
                                      <span>Secondary Glow</span>
                                      <input
                                        type="color"
                                        value={modMenuConfig.customSecondaryAccent || '#9d4edd'}
                                        onChange={(e) =>
                                          setModMenuConfig((prev) => ({
                                            ...prev,
                                            customSecondaryAccent: e.target.value,
                                          }))
                                        }
                                        className="w-10 h-8 rounded cursor-pointer border-0 bg-transparent"
                                      />
                                    </label>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                                      Menu Header Label (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={modMenuConfig.customBadge || ''}
                                      onChange={(e) =>
                                        setModMenuConfig((prev) => ({
                                          ...prev,
                                          customBadge: e.target.value,
                                        }))
                                      }
                                      placeholder="e.g. RAJA LUCK VIP MOD"
                                      className="w-full px-3 py-2 min-h-[40px] border border-[#e6e3da] rounded-xl text-xs bg-white text-[#0f1115]"
                                    />
                                  </div>

                                  <div className="flex flex-col justify-end gap-1.5 text-xs text-[#3f4450] font-semibold">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={modMenuConfig.showColorNumberPred}
                                        onChange={(e) =>
                                          setModMenuConfig((prev) => ({
                                            ...prev,
                                            showColorNumberPred: e.target.checked,
                                          }))
                                        }
                                        className="rounded border-[#c8c3b6]"
                                      />
                                      <span>Color & Number Predictions</span>
                                    </label>
                                    {modMenuConfig.menuType === 'wingo-full' && (
                                      <>
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={modMenuConfig.showLevelSplit}
                                            onChange={(e) =>
                                              setModMenuConfig((prev) => ({
                                                ...prev,
                                                showLevelSplit: e.target.checked,
                                              }))
                                            }
                                            className="rounded border-[#c8c3b6]"
                                          />
                                          <span>1–5 Level Amount Splitter</span>
                                        </label>
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={modMenuConfig.showManualHistory}
                                            onChange={(e) =>
                                              setModMenuConfig((prev) => ({
                                                ...prev,
                                                showManualHistory: e.target.checked,
                                              }))
                                            }
                                            className="rounded border-[#c8c3b6]"
                                          />
                                          <span>Win / Loss History Panel</span>
                                        </label>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Live Mini Mod Menu Preview (Faithful to In-Game Menu) */}
                          <div className="lg:col-span-5">
                            <div className="text-[11px] font-bold text-[#616570] uppercase tracking-wider mb-2">
                              Live Mod Menu Preview
                            </div>
                            {!modMenuConfig.enabled ? (
                              <div className="rounded-xl border border-dashed border-[#c8c3b6] bg-white p-6 text-center text-xs text-[#616570]">
                                Mod Menu disabled — game will open pure full-screen without a Menu panel.
                              </div>
                            ) : (
                              <div
                                className="rounded-2xl p-[1.5px]"
                                style={{
                                  background: previewTheme.frameGradient || previewTheme.borderColor,
                                  boxShadow: previewTheme.glowShadow,
                                }}
                              >
                                <div
                                  className="rounded-[15px] p-4 text-white space-y-3"
                                  style={{ backgroundColor: previewTheme.cardBg }}
                                >
                                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                                    <span
                                      className="font-orbitron text-[10px] font-black tracking-wider truncate"
                                      style={{ color: previewTheme.accent }}
                                    >
                                      ⚡ {previewTheme.label}
                                    </span>
                                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/10 text-amber-300">
                                      00:45
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div
                                        className="text-[10px] uppercase font-semibold"
                                        style={{ color: previewTheme.secondaryAccent }}
                                      >
                                        {modMenuConfig.clockMode === 'utc-partner-api'
                                          ? 'Partner Wingo 1M'
                                          : 'KWG Wingo 1M'}
                                      </div>
                                      <div
                                        className="font-orbitron text-2xl font-black mt-0.5"
                                        style={{ color: previewTheme.accent }}
                                      >
                                        BIG
                                      </div>
                                    </div>
                                    <div
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${
                                        previewTheme.ctaTextDark ? 'text-slate-950' : 'text-white'
                                      }`}
                                      style={{ background: previewTheme.ctaGradient }}
                                    >
                                      Go to Game
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] text-slate-300">
                                    {modMenuConfig.showColorNumberPred && (
                                      <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10">
                                        Color & #0–9
                                      </span>
                                    )}
                                    {modMenuConfig.menuType === 'wingo-full' &&
                                      modMenuConfig.showLevelSplit && (
                                        <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10">
                                          1–5 Levels
                                        </span>
                                      )}
                                    {modMenuConfig.menuType === 'wingo-full' &&
                                      modMenuConfig.showManualHistory && (
                                        <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10">
                                          Win/Loss History
                                        </span>
                                      )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pricing & Thumbnail */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                        Access Pricing
                      </label>
                      <select
                        value={gamePricing}
                        onChange={(e) => setGamePricing(e.target.value === 'paid' ? 'paid' : 'free')}
                        className="w-full px-3.5 py-2.5 min-h-[42px] border border-[#e6e3da] rounded-xl text-sm bg-[#f6f5f1] text-[#0f1115]"
                      >
                        <option value="free">Free</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    {gamePricing === 'paid' && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                            Price (INR)
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            value={gamePrice}
                            onChange={(e) => setGamePrice(e.target.value)}
                            className={`${inputDay} font-mono tabular-nums`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                            Billing Rule
                          </label>
                          <select
                            value={gameBilling}
                            onChange={(e) =>
                              setGameBilling(e.target.value === 'per_play' ? 'per_play' : 'once')
                            }
                            className="w-full px-3.5 py-2.5 min-h-[42px] border border-[#e6e3da] rounded-xl text-sm bg-[#f6f5f1] text-[#0f1115]"
                          >
                            <option value="once">One-Time Unlock</option>
                            <option value="per_play">Per Play Entry</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-8 space-y-2">
                      <label className="block text-xs font-bold text-[#3f4450]">
                        Custom Thumbnail (Upload Image or Enter URL)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={gameThumb}
                          onChange={(e) => setGameThumb(e.target.value)}
                          placeholder="/src/assets/images/..."
                          className="flex-1 px-3.5 py-2 min-h-[42px] bg-[#f6f5f1] border border-[#e6e3da] rounded-xl text-xs font-mono text-[#0f1115]"
                        />
                        <label className="min-h-[42px] px-4 rounded-xl border border-[#e6e3da] bg-white hover:bg-[#f6f5f1] text-xs font-bold text-[#0f1115] inline-flex items-center justify-center gap-2 cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          Upload Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleThumbUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="md:col-span-4 flex justify-end">
                      <img
                        src={gameThumb}
                        alt="Thumbnail preview"
                        className="w-36 h-24 object-cover rounded-xl border border-[#e6e3da] bg-[#f6f5f1]"
                      />
                    </div>
                  </div>

                  {showLivePreview && (
                    <div className="rounded-xl border border-[#e6e3da] overflow-hidden bg-slate-950">
                      <div className="px-4 py-2 bg-[#0f1115] text-white text-xs font-bold flex items-center justify-between">
                        <span>Live Game Sandbox Test Preview</span>
                        <span className="text-[11px] font-mono text-emerald-400">SANDBOX</span>
                      </div>
                      {gameMode === 'embed' && /^https?:\/\//i.test(embedUrl.trim()) ? (
                        <iframe
                          title="Admin Embed Preview"
                          src={embedUrl.trim()}
                          className="w-full h-80 border-0 bg-[#050508]"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <iframe
                          title="Admin Code Preview"
                          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"
                          srcDoc={
                            /<!doctype\s+html|<html[\s>]/i.test(gameHtml)
                              ? `${gameHtml}${gameCss ? `<style>${gameCss}</style>` : ''}${gameJs ? `<script>${gameJs}</script>` : ''}`
                              : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;min-height:100%;background:#050508;color:#fff;}${gameCss}</style></head><body>${gameHtml}${gameJs ? `<script>${gameJs}</script>` : ''}</body></html>`
                          }
                          className="w-full h-80 border-0 bg-slate-950"
                        />
                      )}
                      <div className="p-3 bg-[#0f1115] border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setShowLivePreview(false)}
                          className="press-scale w-full min-h-[42px] rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                        >
                          Close Preview
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-[#e6e3da]">
                    <button
                      type="button"
                      onClick={() => setShowLivePreview((v) => !v)}
                      className="press-scale min-h-[44px] px-4 rounded-xl border border-[#e6e3da] bg-white hover:bg-[#f6f5f1] text-xs font-bold text-[#0f1115] inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      {showLivePreview ? 'Hide Preview' : 'Test / Preview Game'}
                    </button>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowGameForm(false)}
                        className="press-scale min-h-[44px] px-5 rounded-xl border border-[#e6e3da] text-sm font-semibold text-[#616570] hover:text-[#0f1115] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-shine press-scale min-h-[44px] px-6 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-sm font-bold cursor-pointer"
                      >
                        {editingGame ? 'Save Changes' : 'Submit & Publish Game'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {gamesLoading ? (
                  <div className="col-span-full p-8 text-center text-sm text-[#616570]">
                    Loading games...
                  </div>
                ) : (
                  games.map((g, idx) => (
                    <div
                      key={g.id}
                      className="card-lift studio-card rounded-2xl overflow-hidden flex flex-col animate-fade-up"
                      style={{ animationDelay: `${Math.min(idx * 35, 220)}ms` }}
                    >
                      <div className="aspect-[4/3] bg-[#eceae3] overflow-hidden border-b border-[#e6e3da]">
                        <img
                          src={resolveAssetUrl(g.thumbnail)}
                          alt={g.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <div className="text-xs text-[#616570] font-medium">
                            {g.is_default ? 'Default · ' : ''}
                            {g.game_mode === 'embed' ? 'Embed Link · ' : 'Source Code · '}
                            {g.pricing_type === 'free'
                              ? 'Free'
                              : `${formatCurrency(g.price)} (${g.billing_mode === 'once' ? 'Unlock' : 'Per Play'})`}
                          </div>
                          <h3 className="text-base font-extrabold text-[#0f1115] mt-1">{g.title}</h3>
                          <p className="text-xs text-[#616570] mt-1 line-clamp-2">{g.description}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#efede7]">
                          <button
                            type="button"
                            onClick={() => openEditGameForm(g)}
                            className="press-scale flex-1 min-h-[40px] px-3 rounded-xl border border-[#e6e3da] bg-[#f6f5f1] hover:bg-[#eceae3] text-xs font-bold text-[#0f1115] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          {g.is_default ? (
                            <button
                              type="button"
                              onClick={handleRestoreDefaultKwg}
                              className="press-scale min-h-[40px] px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteGame(g)}
                              className="press-scale min-h-[40px] px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PAYMENTS */}
          {tab === 'payments' && (
            <div className="max-w-2xl studio-card rounded-2xl p-6 sm:p-8 animate-fade-up">
              <h2 className="text-lg font-extrabold text-[#0f1115]">Payment & Dynamic UPI Configuration</h2>
              <p className="text-xs text-[#616570] mt-1">
                Configure the UPI ID used to generate dynamic QR codes whenever users click Add Funds.
              </p>

              <form onSubmit={handleSavePaymentSettings} className="mt-6 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#f6f5f1] border border-[#e6e3da]">
                  <div>
                    <div className="text-sm font-bold text-[#0f1115]">Enable User Deposits</div>
                    <div className="text-xs text-[#616570]">
                      Turn off to temporarily pause UPI deposit requests.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPaySettings((p) => ({ ...p, depositsEnabled: !p.depositsEnabled }))
                    }
                    className={`min-h-[38px] px-4 rounded-xl text-xs font-bold cursor-pointer ${
                      paySettings.depositsEnabled
                        ? 'bg-[#059669] text-white'
                        : 'bg-[#e6e3da] text-[#3f4450]'
                    }`}
                  >
                    {paySettings.depositsEnabled ? 'Enabled' : 'Paused'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                    Merchant / Payee UPI ID
                  </label>
                  <input
                    type="text"
                    required
                    value={paySettings.upiId}
                    onChange={(e) => setPaySettings((p) => ({ ...p, upiId: e.target.value }))}
                    placeholder="merchant@upi"
                    className={`${inputDay} font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                    Payee Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={paySettings.payeeName}
                    onChange={(e) => setPaySettings((p) => ({ ...p, payeeName: e.target.value }))}
                    className={inputDay}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                      Min Deposit (INR)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={paySettings.minDeposit}
                      onChange={(e) =>
                        setPaySettings((p) => ({ ...p, minDeposit: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                      Max Deposit (INR)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={paySettings.maxDeposit}
                      onChange={(e) =>
                        setPaySettings((p) => ({ ...p, maxDeposit: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono tabular-nums`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                    Payment Instructions Shown to Users
                  </label>
                  <textarea
                    rows={3}
                    value={paySettings.instructions}
                    onChange={(e) => setPaySettings((p) => ({ ...p, instructions: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-[#f6f5f1] border border-[#e6e3da] rounded-xl text-sm text-[#0f1115]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={payLoading}
                  className="btn-shine press-scale min-h-[48px] px-6 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-sm font-bold cursor-pointer"
                >
                  Save Payment Settings
                </button>
              </form>
            </div>
          )}

          {/* TAB 6: EVERYTHING PLATFORM CONTROL CENTER */}
          {tab === 'system' && (
            <form onSubmit={handleSaveSystemConfig} className="space-y-6 animate-fade-up">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[#0f1115]">Everything Control Center</h2>
                  <p className="text-xs text-[#616570]">
                    Edit Number & Color prediction rates, durations, Predictor AI brain strategy, brand name, announcements, welcome bonus, and maintenance mode live.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={sysSaving || sysLoading}
                  className="btn-shine press-scale min-h-[44px] px-6 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-50 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  {sysSaving ? 'Saving...' : 'Save All Controls'}
                </button>
              </div>

              {/* 1. Prediction Pricing & Hours */}
              <section className="studio-card rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-[#e6e3da]">
                  <Hash className="w-4 h-4 text-[#d97706]" />
                  <h3 className="text-sm font-extrabold text-[#0f1115]">
                    Number & Color Prediction Rates & Durations
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-extrabold text-[#0f1115]">Number Bet (0–9)</div>
                        <div className="text-[11px] text-[#616570]">Default: ₹20 for 24 hours</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSysConfig((c) => ({ ...c, numberPredEnabled: !c.numberPredEnabled }))
                        }
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          sysConfig.numberPredEnabled
                            ? 'bg-[#059669] text-white'
                            : 'bg-[#e6e3da] text-[#3f4450]'
                        }`}
                      >
                        {sysConfig.numberPredEnabled ? 'Enabled' : 'Paused'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#3f4450] mb-1">
                          Base Price (INR)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={sysConfig.numberPredPrice}
                          onChange={(e) =>
                            setSysConfig((c) => ({
                              ...c,
                              numberPredPrice: Number(e.target.value),
                            }))
                          }
                          className={`${inputDay} bg-white font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#3f4450] mb-1">
                          Base Hours
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="8760"
                          value={sysConfig.numberPredHours}
                          onChange={(e) =>
                            setSysConfig((c) => ({
                              ...c,
                              numberPredHours: Number(e.target.value),
                            }))
                          }
                          className={`${inputDay} bg-white font-mono`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-extrabold text-[#0f1115]">Color Prediction</div>
                        <div className="text-[11px] text-[#616570]">Default: ₹10 for 48 hours</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSysConfig((c) => ({ ...c, colorPredEnabled: !c.colorPredEnabled }))
                        }
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          sysConfig.colorPredEnabled
                            ? 'bg-[#059669] text-white'
                            : 'bg-[#e6e3da] text-[#3f4450]'
                        }`}
                      >
                        {sysConfig.colorPredEnabled ? 'Enabled' : 'Paused'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#3f4450] mb-1">
                          Base Price (INR)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={sysConfig.colorPredPrice}
                          onChange={(e) =>
                            setSysConfig((c) => ({
                              ...c,
                              colorPredPrice: Number(e.target.value),
                            }))
                          }
                          className={`${inputDay} bg-white font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#3f4450] mb-1">
                          Base Hours
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="8760"
                          value={sysConfig.colorPredHours}
                          onChange={(e) =>
                            setSysConfig((c) => ({
                              ...c,
                              colorPredHours: Number(e.target.value),
                            }))
                          }
                          className={`${inputDay} bg-white font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      Min Custom Hours
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={sysConfig.minUnlockHours}
                      onChange={(e) =>
                        setSysConfig((c) => ({
                          ...c,
                          minUnlockHours: Number(e.target.value),
                        }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      Max Custom Hours
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="8760"
                      value={sysConfig.maxUnlockHours}
                      onChange={(e) =>
                        setSysConfig((c) => ({
                          ...c,
                          maxUnlockHours: Number(e.target.value),
                        }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      New User Welcome Bonus (INR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sysConfig.welcomeBonus}
                      onChange={(e) =>
                        setSysConfig((c) => ({
                          ...c,
                          welcomeBonus: Number(e.target.value),
                        }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                </div>
              </section>

              {/* 1B. Gemini AI Predictor Paid Subscription Pricing */}
              <section className="studio-card rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b studio-divider">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                    <div>
                      <h3 className="text-sm font-extrabold">
                        Gemini AI Prediction Pass Plans
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Default: 7 Days ₹101 · 15 Days ₹250 · Monthly ₹499 · Yearly ₹1199
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSysConfig((c) => ({ ...c, aiPredEnabled: !c.aiPredEnabled }))
                    }
                    className={`min-h-[34px] px-3.5 rounded-lg text-xs font-bold cursor-pointer ${
                      sysConfig.aiPredEnabled
                        ? 'bg-[#059669] text-white'
                        : 'studio-muted text-[var(--text-secondary)] border'
                    }`}
                  >
                    {sysConfig.aiPredEnabled ? 'AI Pass Purchases Enabled' : 'AI Pass Paused'}
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      Weekly (7d) Price ₹
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sysConfig.aiWeeklyPrice}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, aiWeeklyPrice: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      15 Days Price ₹
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sysConfig.ai15DaysPrice}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, ai15DaysPrice: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      Monthly (30d) Price ₹
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sysConfig.aiMonthlyPrice}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, aiMonthlyPrice: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      Yearly (365d) Price ₹
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sysConfig.aiYearlyPrice}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, aiYearlyPrice: Number(e.target.value) }))
                      }
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                </div>
              </section>

              {/* 2. Combined 3-Strategy Predictor Engine & Dashboard */}
              <section className="studio-card rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[#e6e3da]">
                  <Brain className="w-4 h-4 text-[#1d4ed8]" />
                  <h3 className="text-sm font-extrabold text-[#0f1115]">
                    Gemini AI &amp; 3-Strategy Combined Engine
                  </h3>
                </div>
                <AdminCombinedAiDashboard
                  strategyConfig={normalizeStrategyConfig(
                    sysConfig.strategyConfig,
                    sysConfig.predictorMode
                  )}
                  savingStrategies={savingStrategies}
                  onUpdateStrategies={handleUpdateAiStrategies}
                />
              </section>

              {/* 3. Branding, Banner, Registration & Maintenance */}
              <section className="studio-card rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-[#e6e3da]">
                  <Megaphone className="w-4 h-4 text-[#1d4ed8]" />
                  <h3 className="text-sm font-extrabold text-[#0f1115]">
                    Branding, Announcements, Registrations & Maintenance
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                      Platform Brand Name
                    </label>
                    <input
                      type="text"
                      value={sysConfig.brandName}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, brandName: e.target.value }))
                      }
                      className={inputDay}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                      Telegram Support Handle or URL
                    </label>
                    <input
                      type="text"
                      value={sysConfig.supportUrl}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, supportUrl: e.target.value }))
                      }
                      placeholder="@animetraderss or https://t.me/animetraderss"
                      className={`${inputDay} font-mono`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3f4450] mb-1.5">
                    Platform Tagline
                  </label>
                  <input
                    type="text"
                    value={sysConfig.tagline}
                    onChange={(e) =>
                      setSysConfig((c) => ({ ...c, tagline: e.target.value }))
                    }
                    className={inputDay}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#0f1115]">
                        Top Announcement Banner
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSysConfig((c) => ({
                            ...c,
                            announcementEnabled: !c.announcementEnabled,
                          }))
                        }
                        className={`min-h-[32px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          sysConfig.announcementEnabled
                            ? 'bg-[#059669] text-white'
                            : 'bg-[#e6e3da] text-[#3f4450]'
                        }`}
                      >
                        {sysConfig.announcementEnabled ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={sysConfig.announcementText}
                      onChange={(e) =>
                        setSysConfig((c) => ({ ...c, announcementText: e.target.value }))
                      }
                      placeholder="Type announcement text shown across the app..."
                      className={`${inputDay} bg-white`}
                    />
                  </div>

                  <div className="rounded-xl bg-[#f6f5f1] border border-[#e6e3da] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#0f1115]">
                        New Player Registrations
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSysConfig((c) => ({
                            ...c,
                            registrationsEnabled: !c.registrationsEnabled,
                          }))
                        }
                        className={`min-h-[32px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          sysConfig.registrationsEnabled
                            ? 'bg-[#059669] text-white'
                            : 'bg-[#dc2626] text-white'
                        }`}
                      >
                        {sysConfig.registrationsEnabled ? 'Open' : 'Paused'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-extrabold text-[#0f1115]">Maintenance Mode</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSysConfig((c) => ({
                            ...c,
                            maintenanceMode: !c.maintenanceMode,
                          }))
                        }
                        className={`min-h-[32px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          sysConfig.maintenanceMode
                            ? 'bg-[#d97706] text-white'
                            : 'bg-[#e6e3da] text-[#3f4450]'
                        }`}
                      >
                        {sysConfig.maintenanceMode ? 'Active' : 'Off'}
                      </button>
                    </div>
                    {sysConfig.maintenanceMode && (
                      <input
                        type="text"
                        value={sysConfig.maintenanceMessage}
                        onChange={(e) =>
                          setSysConfig((c) => ({ ...c, maintenanceMessage: e.target.value }))
                        }
                        placeholder="Maintenance message..."
                        className={`${inputDay} bg-white`}
                      />
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={sysSaving || sysLoading}
                    className="btn-shine press-scale min-h-[48px] px-8 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
                  >
                    {sysSaving ? 'Saving Platform Controls...' : 'Save Platform Controls'}
                  </button>
                </div>
              </section>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
