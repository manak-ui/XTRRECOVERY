export type AppTheme = 'light' | 'dark' | 'neon';
export type AiPlanId = 'weekly' | '15days' | 'monthly' | 'yearly';

export interface UserProfile {
  id: number;
  uid: string;
  username: string;
  phone: string;
  email: string;
  walletBalance: number;
  isAdmin: boolean;
  status: 'active' | 'banned';
  banReason: string | null;
  banNotice: string | null;
  bannedAt: string | null;
  banExpiresAt?: string | null;
  numberPredExpiresAt: string | null;
  colorPredExpiresAt: string | null;
  aiPredExpiresAt: string | null;
  aiPassActive?: boolean;
  deviceId?: string;
  createdAt: string;
}

export type GameMode = 'source' | 'embed';
export type ModMenuStyle =
  | 'cyber-cyan'
  | 'neon-green'
  | 'high-blue'
  | 'spectrum'
  | 'crimson-red'
  | 'red-blue'
  | 'royal-gold'
  | 'custom';
export type ModMenuType = 'wingo-full' | 'compact-hud' | 'none';
export type WingoClockMode = 'ist-standard' | 'utc-partner-api';

export interface ModMenuConfig {
  enabled: boolean;
  menuType: ModMenuType;
  themePreset: ModMenuStyle;
  customAccent?: string;
  customSecondaryAccent?: string;
  customBadge?: string;
  clockMode: WingoClockMode;
  showLevelSplit: boolean;
  showManualHistory: boolean;
  showColorNumberPred: boolean;
}

export interface GameSummary {
  id: number;
  slug: string;
  name: string;
  title: string;
  description: string;
  thumbnail: string;
  pricing_type: 'free' | 'paid';
  price: number;
  billing_mode: 'once' | 'per_play';
  gameMode: GameMode;
  embedUrl: string;
  modMenuConfig: ModMenuConfig;
  isDefault: boolean;
  isUnlocked: boolean;
  created_at: string;
}

export interface AdminGame {
  id: number;
  slug: string;
  name: string;
  title: string;
  description: string;
  thumbnail: string;
  pricing_type: 'free' | 'paid';
  price: number;
  billing_mode: 'once' | 'per_play';
  html_code: string;
  css_code: string;
  js_code: string;
  game_mode: GameMode;
  embed_url: string;
  mod_menu_config: string;
  modMenuConfig?: ModMenuConfig;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentSettings {
  upiId: string;
  payeeName: string;
  instructions: string;
  depositsEnabled: boolean;
  minDeposit: number;
  maxDeposit: number;
  updatedAt?: string;
}

export type PredictorMode = 'pattern-ai' | 'trend-follow' | 'contrarian';
export type WingoInterval = '30s' | '1m';
export type StrategyId = 'pattern-ai' | 'trend-follow' | 'contrarian';

export interface StrategyConfigState {
  patternBrainEnabled: boolean;
  momentumTrendEnabled: boolean;
  dragonContrarianEnabled: boolean;
  allThreeStrategiesActive: boolean;
}

export interface PlatformConfig {
  brandName: string;
  tagline: string;
  announcementText: string;
  announcementEnabled: boolean;
  supportUrl: string;
  registrationsEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  welcomeBonus: number;
  numberPredPrice: number;
  numberPredHours: number;
  numberPredEnabled: boolean;
  colorPredPrice: number;
  colorPredHours: number;
  colorPredEnabled: boolean;
  minUnlockHours: number;
  maxUnlockHours: number;
  aiWeeklyPrice: number;
  ai15DaysPrice: number;
  aiMonthlyPrice: number;
  aiYearlyPrice: number;
  aiPredEnabled: boolean;
  predictorMode: PredictorMode;
  strategyConfig?: StrategyConfigState;
  updatedAt?: string;
}

export interface DepositRecord {
  id: number;
  reference_id: string;
  user_id: number;
  amount: number;
  utr: string;
  upi_id: string;
  status: 'pending' | 'completed' | 'rejected';
  custom_status?: string;
  admin_notice: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  user_uid?: string;
  user_name?: string;
  user_phone?: string;
}

export interface WalletTransaction {
  id: number;
  user_id: number;
  type: 'deposit_credit' | 'admin_credit' | 'admin_debit' | 'game_purchase' | 'prediction_unlock';
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  category: 'deposit' | 'wallet' | 'game' | 'notice' | 'security' | 'ban';
  title: string;
  details: string;
  admin_notice: string;
  amount: number | null;
  status: string;
  created_at: string;
}

export interface AdminStatsResponse {
  period: string;
  periodLabel: string;
  overall: {
    totalUsers: number;
    activeUsers: number;
    bannedUsers: number;
    totalWalletBalance: number;
    totalDepositsCount: number;
    totalDepositsAmount: number;
    approvedDepositsCount: number;
    approvedDepositsAmount: number;
    pendingDepositsCount: number;
    pendingDepositsAmount: number;
    rejectedDepositsCount: number;
    rejectedDepositsAmount: number;
    paidGameRevenue: number;
    profitLoss: number;
  };
  periodStats: {
    newUsers: number;
    totalDepositsCount: number;
    totalDepositsAmount: number;
    approvedDepositsCount: number;
    approvedDepositsAmount: number;
    pendingDepositsCount: number;
    pendingDepositsAmount: number;
    rejectedDepositsCount: number;
    rejectedDepositsAmount: number;
    paidGameRevenue: number;
    adminCredits: number;
    adminDebits: number;
    profitLoss: number;
  };
}

export interface PrefilledBanNotice {
  id: string;
  reason: string;
  notice: string;
}

export interface BanInfo {
  banReason: string;
  banNotice: string;
  bannedAt?: string | null;
  banExpiresAt?: string | null;
}

export interface ModMenuRoundRecord {
  id: number;
  user_id: number;
  game_slug: string;
  game_name: string;
  period_id: string;
  signal: 'BIG' | 'SMALL';
  level: number;
  max_levels: number;
  bet_amount: number;
  outcome: 'WIN' | 'LOSS' | 'STOP';
  pnl_delta: number;
  entry_type: 'manual' | 'auto';
  actual_number: number | null;
  actual_result: 'BIG' | 'SMALL' | '';
  created_at: string;
}

export interface StrategyValidationStats {
  wins: number;
  losses: number;
  evaluated: number;
  hitRate: number | null;
  weight: number;
}

export interface AiPredictionHistoryItem {
  id: number;
  periodId: string;
  interval: WingoInterval;
  gameSlug: string;
  gameName: string;
  signal: 'BIG' | 'SMALL' | 'SKIP';
  digit: number;
  color: 'GREEN' | 'RED';
  hasViolet: boolean;
  confidence: number;
  selectedStrategy: string;
  strategyTag: string;
  reasonSummary: string;
  actualNumber: number | null;
  actualResult: 'BIG' | 'SMALL' | null;
  outcome: 'WIN' | 'LOSS' | 'PENDING' | 'SKIPPED';
  createdAt: string;
}
