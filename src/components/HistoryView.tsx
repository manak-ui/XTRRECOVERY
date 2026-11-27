import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest, formatCurrency, formatDateTime } from '../api';
import type { ActivityLog, ModMenuRoundRecord } from '../types';

const CATEGORIES = [
  { id: 'all', label: 'All Activity' },
  { id: 'mod_history', label: 'Mod Menu Win/Loss' },
  { id: 'deposit', label: 'Deposits' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'game', label: 'Games' },
  { id: 'security', label: 'Security' },
  { id: 'ban', label: 'Notices & Bans' },
];

interface DailyWinPerformancePoint {
  dateKey: string;
  shortLabel: string;
  fullLabel: string;
  wins: number;
  losses: number;
  total: number;
  successRate: number;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSevenDayPerformance(records: ModMenuRoundRecord[]): {
  points: DailyWinPerformancePoint[];
  totalWins: number;
  totalLosses: number;
  totalRounds: number;
  overallRate: number;
  bestRate: number | null;
  activeDays: number;
} {
  const now = new Date();
  const buckets = new Map<string, DailyWinPerformancePoint>();
  const orderedKeys: string[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = toLocalDateKey(dt);
    orderedKeys.push(key);
    buckets.set(key, {
      dateKey: key,
      shortLabel:
        offset === 0
          ? 'Today'
          : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      fullLabel: dt.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      wins: 0,
      losses: 0,
      total: 0,
      successRate: 0,
    });
  }

  for (const row of records) {
    if (!row.created_at) continue;
    const dt = new Date(row.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    const key = toLocalDateKey(dt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (row.outcome === 'WIN') {
      bucket.wins += 1;
    } else {
      bucket.losses += 1;
    }
  }

  let totalWins = 0;
  let totalLosses = 0;
  let totalRounds = 0;
  let activeDays = 0;
  let bestRate: number | null = null;

  const points = orderedKeys.map((key) => {
    const b = buckets.get(key)!;
    if (b.total > 0) {
      b.successRate = Math.round((b.wins / b.total) * 100);
      totalWins += b.wins;
      totalLosses += b.losses;
      totalRounds += b.total;
      activeDays += 1;
      if (bestRate === null || b.successRate > bestRate) {
        bestRate = b.successRate;
      }
    }
    return b;
  });

  const overallRate = totalRounds > 0 ? Math.round((totalWins / totalRounds) * 100) : 0;

  return {
    points,
    totalWins,
    totalLosses,
    totalRounds,
    overallRate,
    bestRate,
    activeDays,
  };
}

interface WinPerfTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyWinPerformancePoint }>;
}

const WinPerfTooltip: React.FC<WinPerfTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="studio-card rounded-xl px-3.5 py-2.5 shadow-xl border text-xs min-w-[164px]">
      <div className="font-bold text-[var(--text-primary)] mb-1">{point.fullLabel}</div>
      {point.total > 0 ? (
        <div className="space-y-1 font-mono tabular-nums">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--text-secondary)] font-sans">Success Rate</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {point.successRate}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--text-secondary)] font-sans">Wins / Losses</span>
            <span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {point.wins}W
              </span>
              <span className="text-[var(--text-secondary)] mx-1">/</span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                {point.losses}L
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t studio-divider">
            <span className="text-[var(--text-secondary)] font-sans">Settled Rounds</span>
            <span className="font-semibold">{point.total}</span>
          </div>
        </div>
      ) : (
        <div className="text-[var(--text-secondary)]">No rounds recorded on this day</div>
      )}
    </div>
  );
};

export const HistoryView: React.FC = () => {
  const [category, setCategory] = useState('all');
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [modRecords, setModRecords] = useState<ModMenuRoundRecord[]>([]);
  const [perfRecords, setPerfRecords] = useState<ModMenuRoundRecord[]>([]);
  const [modStats, setModStats] = useState<{
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnl: number;
  }>({ total: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0 });
  const [loading, setLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await apiRequest<{
        records: ModMenuRoundRecord[];
      }>('/api/mod-history');
      setPerfRecords(Array.isArray(res.records) ? res.records : []);
    } catch {
      setPerfRecords([]);
    } finally {
      setPerfLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (cat: string) => {
    setLoading(true);
    setError(null);
    try {
      if (cat === 'mod_history') {
        const res = await apiRequest<{
          records: ModMenuRoundRecord[];
          stats: { total: number; wins: number; losses: number; winRate: number; netPnl: number };
        }>('/api/mod-history?entryType=manual');
        setModRecords(res.records);
        setModStats(res.stats);
      } else {
        const res = await apiRequest<{ history: ActivityLog[] }>(
          `/api/history?category=${encodeURIComponent(cat)}`
        );
        setItems(res.history);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPerformance();
  }, [fetchPerformance]);

  useEffect(() => {
    void fetchHistory(category);
  }, [category, fetchHistory]);

  const handleRefresh = useCallback(() => {
    void fetchHistory(category);
    void fetchPerformance();
  }, [category, fetchHistory, fetchPerformance]);

  const sevenDayPerf = useMemo(
    () => buildSevenDayPerformance(perfRecords),
    [perfRecords]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Account Activity & History
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Complete ledger of deposits, custom statuses, wallet updates, Mod Menu rounds, and admin notices.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="press-scale min-h-[44px] px-4 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-2 self-start cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-4 h-4 text-[var(--accent-primary)] ${loading || perfLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {/* Win Performance 7-Day Visual Chart */}
      <section
        aria-label="Win Performance"
        className="studio-card rounded-2xl p-5 sm:p-6 space-y-5 animate-fade-up"
        style={{ animationDelay: '30ms' }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Win Performance</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Daily success rate across settled game rounds over the last 7 days
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-2 lg:pt-0 border-t lg:border-t-0 studio-divider">
            <div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                7-Day Rate
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {sevenDayPerf.totalRounds > 0 ? `${sevenDayPerf.overallRate}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                Wins / Rounds
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono tabular-nums">
                {sevenDayPerf.totalWins}
                <span className="text-[var(--text-secondary)] font-semibold mx-1">/</span>
                {sevenDayPerf.totalRounds}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                Best Day
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono tabular-nums text-[var(--accent-primary)]">
                {sevenDayPerf.bestRate !== null ? `${sevenDayPerf.bestRate}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        {perfLoading ? (
          <div className="h-60 w-full studio-muted rounded-xl animate-pulse" />
        ) : (
          <div className="relative h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sevenDayPerf.points}
                margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="winPerfAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  opacity={0.12}
                />
                <XAxis
                  dataKey="shortLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  dy={6}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(val) => `${val}%`}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                />
                <ReferenceLine
                  y={50}
                  stroke="var(--text-secondary)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.35}
                />
                <Tooltip content={<WinPerfTooltip />} />
                <Area
                  type="monotone"
                  dataKey="successRate"
                  name="Success Rate"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#winPerfAreaFill)"
                  dot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: '#10b981',
                    fill: 'var(--bg-surface, #0f172a)',
                  }}
                  activeDot={{
                    r: 6,
                    strokeWidth: 2,
                    stroke: '#ffffff',
                    fill: '#10b981',
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {sevenDayPerf.totalRounds === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
                <div className="studio-card rounded-xl px-4 py-2.5 text-center text-xs text-[var(--text-secondary)] max-w-sm shadow-sm">
                  No settled rounds in the last 7 days yet. Play any game and record WIN or LOSS outcomes in its Menu tab to track your daily rate.
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <div
        className="flex items-center gap-1.5 p-1.5 studio-card rounded-xl overflow-x-auto animate-fade-up"
        style={{ animationDelay: '50ms' }}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`press-scale px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              category === c.id
                ? 'ink-btn font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      {category === 'mod_history' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-up" style={{ animationDelay: '90ms' }}>
            <div className="card-lift studio-card rounded-xl p-4">
              <div className="text-xs text-[var(--text-secondary)] font-medium">Total Rounds</div>
              <div className="text-xl font-extrabold font-mono tabular-nums mt-1">
                {modStats.total}
              </div>
            </div>
            <div className="card-lift studio-card rounded-xl p-4">
              <div className="text-xs text-[var(--text-secondary)] font-medium">Wins / Losses</div>
              <div className="text-xl font-extrabold font-mono tabular-nums mt-1">
                <span className="text-emerald-600 dark:text-emerald-400">{modStats.wins}</span>
                <span className="text-[var(--text-secondary)] mx-1.5">/</span>
                <span className="text-rose-600 dark:text-rose-400">{modStats.losses}</span>
              </div>
            </div>
            <div className="card-lift studio-card rounded-xl p-4">
              <div className="text-xs text-[var(--text-secondary)] font-medium">Win Rate</div>
              <div className="text-xl font-extrabold font-mono tabular-nums text-[var(--accent-primary)] mt-1">
                {modStats.winRate}%
              </div>
            </div>
            <div className="card-lift studio-card rounded-xl p-4">
              <div className="text-xs text-[var(--text-secondary)] font-medium">Net Mod P&L</div>
              <div
                className={`text-xl font-extrabold font-mono tabular-nums mt-1 ${
                  modStats.netPnl >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {modStats.netPnl >= 0 ? '+' : ''}
                {formatCurrency(modStats.netPnl)}
              </div>
            </div>
          </div>

          <div
            className="studio-card rounded-2xl overflow-hidden animate-fade-up"
            style={{ animationDelay: '130ms' }}
          >
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 studio-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : modRecords.length === 0 ? (
              <div className="p-10 text-center text-sm text-[var(--text-secondary)]">
                No manual Mod Menu WIN or LOSS rounds recorded yet. Play any game and record outcomes in its Menu tab.
              </div>
            ) : (
              <div className="divide-y studio-divider">
                {modRecords.map((row, idx) => {
                  const isWin = row.outcome === 'WIN';
                  return (
                    <div
                      key={row.id}
                      className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 studio-row-hover transition-colors animate-fade-up"
                      style={{ animationDelay: `${Math.min(idx * 25, 200)}ms` }}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
                              isWin
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {isWin ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {row.outcome}
                          </span>
                          <span className="text-sm font-bold">{row.game_name}</span>
                          <span className="font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                            · Period {row.period_id}
                          </span>
                          <span className="font-bold text-[var(--accent-primary)]">
                            · {row.signal}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                          Level {row.level}/{row.max_levels} · Bet {formatCurrency(row.bet_amount)} ·{' '}
                          {formatDateTime(row.created_at)}
                        </div>
                      </div>

                      <div
                        className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                          row.pnl_delta >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {row.pnl_delta >= 0 ? '+' : ''}
                        {formatCurrency(row.pnl_delta)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className="studio-card rounded-2xl overflow-hidden animate-fade-up"
          style={{ animationDelay: '90ms' }}
        >
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-14 studio-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--text-secondary)]">
              No activity recorded under this filter yet.
            </div>
          ) : (
            <div className="divide-y studio-divider">
              {items.map((row, idx) => (
                <div
                  key={row.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 studio-row-hover transition-colors animate-fade-up"
                  style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{row.title}</span>
                      {row.status && (
                        <span
                          className={`text-xs font-bold ${
                            row.status === 'Completed' ||
                            row.status === 'Active' ||
                            row.status === 'Verified' ||
                            row.status === 'WIN'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.status === 'Rejected' ||
                                row.status === 'Banned' ||
                                row.status === 'LOSS' ||
                                row.status === 'STOP'
                              ? 'text-rose-600 dark:text-rose-400'
                              : row.status === 'Pending'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-[var(--accent-primary)]'
                          }`}
                        >
                          · {row.status}
                        </span>
                      )}
                    </div>
                    {row.details && (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {row.details}
                      </p>
                    )}
                    {row.admin_notice && (
                      <div className="mt-2 px-3 py-2 rounded-lg studio-muted border text-xs">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          Admin Notice:
                        </span>{' '}
                        {row.admin_notice}
                      </div>
                    )}
                    <div className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                      {formatDateTime(row.created_at)} · {row.category}
                    </div>
                  </div>

                  {row.amount !== null && row.amount !== undefined && (
                    <div
                      className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                        row.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.amount >= 0 ? '+' : ''}
                      {formatCurrency(row.amount)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
