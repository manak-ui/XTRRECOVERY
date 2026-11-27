import React, { useCallback, useEffect, useState } from 'react';
import {
  QrCode,
  RefreshCw,
  AlertCircle,
  Wallet as WalletIcon,
  PlusCircle,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest, formatCurrency, formatDateTime } from '../api';
import type { DepositRecord, PaymentSettings, UserProfile, WalletTransaction } from '../types';
import { isUserAiPassUnlocked } from '../utils/wingo';
import { AiPassBadge } from './AiPassBadge';

interface WalletViewProps {
  user: UserProfile;
  onBalanceSync: (balance: number) => void;
  onOpenGateway: (amount?: number) => void;
}

const LAUNCHER_PRESETS = ['101', '250', '499', '1000', '1199'];

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  onBalanceSync,
  onOpenGateway,
}) => {
  const [loading, setLoading] = useState(true);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [quickAmount, setQuickAmount] = useState('500');
  const [error, setError] = useState<string | null>(null);
  const aiActive = isUserAiPassUnlocked(user);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        walletBalance: number;
        paymentSettings: PaymentSettings;
        deposits: DepositRecord[];
        transactions: WalletTransaction[];
      }>('/api/wallet/summary');
      setPaymentSettings(res.paymentSettings);
      setDeposits(res.deposits);
      setTransactions(res.transactions);
      onBalanceSync(res.walletBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wallet.');
    } finally {
      setLoading(false);
    }
  }, [onBalanceSync]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const pendingCount = deposits.filter((d) => d.status === 'pending').length;
  const completedCount = deposits.filter((d) => d.status === 'completed').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10 space-y-8">
      {/* Rearranged Split Top Row: Left = Player Vault Balance, Right = Dedicated Payment Gateway Launcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 ink-card rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6 text-white animate-fade-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 flex-wrap text-xs font-semibold text-blue-400 uppercase tracking-wider">
                <WalletIcon className="w-4 h-4" />
                <span>{user.username}</span>
                <AiPassBadge active={aiActive} size="xs" />
                <span className="text-slate-400">· UID {user.uid}</span>
              </div>
              <div className="mt-3 text-4xl sm:text-5xl font-extrabold font-mono tabular-nums tracking-tight text-white">
                {formatCurrency(user.walletBalance)}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Available coins for game unlocks, Number/Color passes, and Gemini AI Predictor plans.
              </div>
            </div>

            <button
              type="button"
              onClick={loadWallet}
              className="press-scale min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white inline-flex items-center justify-center cursor-pointer shrink-0"
              title="Refresh wallet"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-5 text-xs font-mono">
              <div>
                <span className="text-slate-400">Approved:</span>{' '}
                <strong className="text-emerald-400 tabular-nums">{completedCount}</strong>
              </div>
              <div>
                <span className="text-slate-400">Pending:</span>{' '}
                <strong className="text-amber-300 tabular-nums">{pendingCount}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenGateway()}
              className="btn-shine press-scale min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1d4ed8] hover:bg-[#2563eb] text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              Open Payment Gateway
            </button>
          </div>
        </div>

        {/* Right: Quick Deposit Gateway Launcher */}
        <div
          className="lg:col-span-5 studio-card rounded-2xl p-6 flex flex-col justify-between gap-4 animate-fade-up"
          style={{ animationDelay: '50ms' }}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] inline-flex items-center gap-1.5">
                <QrCode className="w-4 h-4" />
                Deposit Gateway
              </div>
              {paymentSettings && (
                <span className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                  {formatCurrency(paymentSettings.minDeposit)}–{formatCurrency(paymentSettings.maxDeposit)}
                </span>
              )}
            </div>
            <h2 className="text-lg font-extrabold mt-1">Generate QR & Submit UTR</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Opens the separate UPI Payment Gateway page. Admin approves every request manually.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-1.5">
              {LAUNCHER_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setQuickAmount(amt)}
                  className={`press-scale min-h-[38px] rounded-xl border text-[11px] font-mono font-bold tabular-nums cursor-pointer transition-all ${
                    quickAmount === amt
                      ? 'accent-btn border-transparent'
                      : 'studio-muted text-[var(--text-primary)]'
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={paymentSettings?.minDeposit || 1}
                max={paymentSettings?.maxDeposit || 50000}
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value)}
                className="studio-input flex-1 px-3.5 py-2 min-h-[46px] rounded-xl font-mono text-sm font-bold tabular-nums"
                placeholder="Amount (INR)"
              />
              <button
                type="button"
                disabled={paymentSettings ? !paymentSettings.depositsEnabled : false}
                onClick={() => onOpenGateway(Math.max(1, Math.round(Number(quickAmount) || 250)))}
                className="btn-shine press-scale min-h-[46px] px-4 rounded-xl accent-btn disabled:opacity-50 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <ShieldCheck className="w-4 h-4" />
                Generate QR
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300 px-4 py-3.5 text-sm flex items-center gap-2 animate-fade-up">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dual Feed Grid: Wallet Ledger & Deposit Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div
          className="lg:col-span-6 studio-card rounded-2xl overflow-hidden animate-fade-up"
          style={{ animationDelay: '70ms' }}
        >
          <div className="px-6 py-4 border-b studio-divider flex items-center justify-between">
            <h3 className="text-base font-extrabold">Deposit Requests</h3>
            <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
              {deposits.length} records
            </span>
          </div>
          {deposits.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              No deposit requests yet. Click Generate QR above to open the Payment Gateway.
            </div>
          ) : (
            <div className="divide-y studio-divider">
              {deposits.map((dep) => {
                const displayStatus = dep.custom_status?.trim()
                  ? dep.custom_status.trim()
                  : dep.status;
                return (
                  <div
                    key={dep.id}
                    className="px-6 py-4 flex items-start justify-between gap-4 studio-row-hover transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold font-mono">{dep.reference_id}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        UTR: <span className="font-mono text-[var(--text-primary)]">{dep.utr}</span> ·{' '}
                        {formatDateTime(dep.created_at)}
                      </div>
                      {dep.admin_notice && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] studio-muted border rounded-lg px-3 py-2">
                          Admin Notice: {dep.admin_notice}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 max-w-[170px]">
                      <div className="text-sm font-bold font-mono tabular-nums">
                        {formatCurrency(dep.amount)}
                      </div>
                      <div
                        className={`text-xs font-bold mt-0.5 capitalize break-words ${
                          dep.status === 'completed'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : dep.status === 'rejected'
                            ? 'text-rose-600 dark:text-rose-400'
                            : dep.custom_status?.trim()
                            ? 'text-[var(--accent-primary)]'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {displayStatus}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="lg:col-span-6 studio-card rounded-2xl overflow-hidden animate-fade-up"
          style={{ animationDelay: '130ms' }}
        >
          <div className="px-6 py-4 border-b studio-divider flex items-center justify-between">
            <h3 className="text-base font-extrabold">Wallet Ledger</h3>
            <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
              {transactions.length} entries
            </span>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              No wallet transactions recorded yet.
            </div>
          ) : (
            <div className="divide-y studio-divider">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="px-6 py-4 flex items-center justify-between gap-4 studio-row-hover transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{tx.description}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono tabular-nums">
                      {tx.reference_id ? `${tx.reference_id} · ` : ''}
                      {formatDateTime(tx.created_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-bold font-mono tabular-nums ${
                        tx.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
                      Bal: {formatCurrency(tx.balance_after)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
