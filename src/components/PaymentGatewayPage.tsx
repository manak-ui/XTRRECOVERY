import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet as WalletIcon,
} from 'lucide-react';
import { apiRequest, formatCurrency } from '../api';
import type { PaymentSettings, UserProfile } from '../types';

interface PaymentGatewayPageProps {
  user: UserProfile;
  initialAmount?: number | null;
  onBack: () => void;
  onOpenWallet: () => void;
  onDepositSubmitted: () => void;
}

interface QrPayload {
  amount: number;
  upiId: string;
  payeeName: string;
  instructions: string;
  upiUri: string;
  qrDataUrl: string;
}

type GatewayStage = 'select' | 'generating' | 'checkout' | 'verifying' | 'submitted';

const QUICK_AMOUNTS = ['101', '250', '499', '1000', '1199', '2000'];
const GATEWAY_DURATION_SEC = 10 * 60;

export const PaymentGatewayPage: React.FC<PaymentGatewayPageProps> = ({
  user,
  initialAmount,
  onBack,
  onOpenWallet,
  onDepositSubmitted,
}) => {
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [amountInput, setAmountInput] = useState<string>(() =>
    initialAmount && initialAmount >= 1 ? String(Math.round(initialAmount)) : '250'
  );
  const [stage, setStage] = useState<GatewayStage>('select');
  const [qrData, setQrData] = useState<QrPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(GATEWAY_DURATION_SEC);
  const [utr, setUtr] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyStep, setVerifyStep] = useState<number>(0);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    referenceId: string;
    amount: number;
    utr: string;
  } | null>(null);

  const startQrCheckout = useCallback(async (targetAmount: number) => {
    setError(null);
    setStage('generating');
    try {
      const [res] = await Promise.all([
        apiRequest<QrPayload>('/api/deposits/qr', {
          method: 'POST',
          body: JSON.stringify({ amount: targetAmount }),
        }),
        new Promise((r) => window.setTimeout(r, 550)),
      ]);
      setQrData(res);
      setSecondsLeft(GATEWAY_DURATION_SEC);
      setStage('checkout');
    } catch (err) {
      setStage('select');
      setError(err instanceof Error ? err.message : 'Unable to generate payment QR.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ walletBalance: number; paymentSettings: PaymentSettings }>('/api/wallet/summary')
      .then((res) => {
        if (!active) return;
        setPaymentSettings(res.paymentSettings);
        if (
          initialAmount &&
          initialAmount > 0 &&
          res.paymentSettings?.depositsEnabled !== false
        ) {
          const clamped = Math.max(
            res.paymentSettings.minDeposit || 1,
            Math.min(res.paymentSettings.maxDeposit || 50000, Math.round(initialAmount))
          );
          setAmountInput(String(clamped));
          void startQrCheckout(clamped);
        }
      })
      .catch(() => {
        // fallback cleanly to select screen
      });
    return () => {
      active = false;
    };
  }, [initialAmount, startQrCheckout]);

  useEffect(() => {
    if (stage !== 'checkout') return undefined;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const handleGenerateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Math.round(Number(amountInput));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter a valid INR deposit amount.');
      return;
    }
    void startQrCheckout(numeric);
  };

  const handleCopyUpi = (upi: string) => {
    navigator.clipboard?.writeText(upi);
    setCopiedUpi(true);
    window.setTimeout(() => setCopiedUpi(false), 1800);
  };

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrData) return;
    const trimmedUtr = utr.trim();
    if (trimmedUtr.length < 6) {
      setError('Enter a valid 12-digit UTR / UPI reference number.');
      return;
    }

    setError(null);
    setStage('verifying');
    setVerifyStep(1);

    try {
      const timer1 = window.setTimeout(() => setVerifyStep(2), 380);
      const timer2 = window.setTimeout(() => setVerifyStep(3), 780);

      const [res] = await Promise.all([
        apiRequest<{
          deposit: { reference_id: string; amount: number; utr: string };
        }>('/api/deposits/request', {
          method: 'POST',
          body: JSON.stringify({ amount: qrData.amount, utr: trimmedUtr }),
        }),
        new Promise((r) => window.setTimeout(r, 1150)),
      ]);

      window.clearTimeout(timer1);
      window.clearTimeout(timer2);

      setSubmittedReceipt({
        referenceId: res.deposit?.reference_id || `DEP-${Date.now().toString().slice(-6)}`,
        amount: qrData.amount,
        utr: trimmedUtr,
      });
      setUtr('');
      setStage('submitted');
      onDepositSubmitted();
    } catch (err) {
      setStage('checkout');
      setError(err instanceof Error ? err.message : 'Unable to submit UTR request.');
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const depositsPaused = paymentSettings ? !paymentSettings.depositsEnabled : false;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 lg:py-10 space-y-6 animate-fade-up">
      {/* Top Gateway Breadcrumb Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="press-scale min-h-[42px] px-4 rounded-xl studio-card text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-[var(--text-secondary)]">
            UID <strong className="text-[var(--text-primary)]">{user.uid}</strong>
          </span>
          <span className="text-[var(--text-secondary)]">·</span>
          <span className="text-[var(--text-secondary)]">
            Wallet{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(user.walletBalance)}
            </strong>
          </span>
        </div>
      </div>

      {/* Main Checkout Terminal */}
      <div className="studio-card rounded-2xl overflow-hidden">
        {/* Gateway Top Bar */}
        <div className="ink-card px-6 py-5 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-0 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              <span className="absolute inset-0 rounded-xl border border-blue-400/50 animate-gateway-ring pointer-events-none" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                Secure UPI Payment Gateway
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Dynamic QR & UTR Verification Checkout
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Manual Admin Settlement · Zero Auto-Credit</span>
          </div>
        </div>

        {/* Step Indicator Strip */}
        <div className="px-6 py-3.5 studio-muted border-b studio-divider grid grid-cols-3 gap-2 text-xs">
          <div
            className={`font-bold inline-flex items-center gap-2 ${
              stage === 'select' || stage === 'generating'
                ? 'text-[var(--accent-primary)]'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <span className="font-mono">01.</span>
            <span className="truncate">Select Amount</span>
          </div>
          <div
            className={`font-bold inline-flex items-center justify-center gap-2 ${
              stage === 'checkout' || stage === 'verifying'
                ? 'text-[var(--accent-primary)]'
                : stage === 'submitted'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <span className="font-mono">02.</span>
            <span className="truncate">Scan QR & Enter UTR</span>
          </div>
          <div
            className={`font-bold inline-flex items-center justify-end gap-2 ${
              stage === 'submitted'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <span className="font-mono">03.</span>
            <span className="truncate">Pending Review</span>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs sm:text-sm font-medium animate-fade-up">
              {error}
            </div>
          )}

          {depositsPaused ? (
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
              <div className="text-base font-extrabold text-amber-600 dark:text-amber-300">
                Deposits Temporarily Paused
              </div>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                The administrator has temporarily paused new deposit submissions. Check back shortly.
              </p>
            </div>
          ) : stage === 'generating' ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4 animate-fade-up">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <span className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)] animate-gateway-ring" />
                <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin" />
              </div>
              <div>
                <div className="text-base font-extrabold">Initializing Encrypted UPI QR...</div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                  Locking payable amount {formatCurrency(Number(amountInput) || 0)}
                </p>
              </div>
            </div>
          ) : stage === 'verifying' ? (
            <div className="py-14 max-w-md mx-auto text-center space-y-6 animate-modal-pop">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <span className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)] animate-gateway-ring" />
                <CreditCard className="w-7 h-7 text-[var(--accent-primary)]" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Processing Payment Proof</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Submitting UTR reference into the admin verification queue...
                </p>
              </div>
              <div className="space-y-2.5 text-left text-xs font-mono">
                {[
                  { step: 1, label: 'Encrypting UTR & transaction payload' },
                  { step: 2, label: 'Binding deposit receipt to UID vault' },
                  { step: 3, label: 'Queuing for manual admin approval' },
                ].map((item) => {
                  const done = verifyStep > item.step;
                  const active = verifyStep === item.step;
                  return (
                    <div
                      key={item.step}
                      className={`px-4 py-3 rounded-xl border flex items-center justify-between transition-all ${
                        done || active
                          ? 'studio-card border-[var(--accent-primary)]/40'
                          : 'studio-muted opacity-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : active ? (
                        <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin shrink-0" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : stage === 'submitted' && submittedReceipt ? (
            <div className="max-w-lg mx-auto py-6 text-center space-y-6 animate-modal-pop">
              <div className="relative w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-500 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8" />
                <span className="absolute inset-0 rounded-2xl border border-amber-400/50 animate-gateway-ring" />
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Request Logged · Pending Admin Verification
                </div>
                <h2 className="text-2xl font-extrabold mt-1">
                  {formatCurrency(submittedReceipt.amount)} Submitted
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                  Coins are <strong>not auto-credited</strong>. Your UTR has been queued for the administrator to verify and update your status.
                </p>
              </div>

              <div className="studio-muted border rounded-xl p-4 text-xs font-mono space-y-2 text-left">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">Receipt ID</span>
                  <span className="font-bold">{submittedReceipt.referenceId}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">UTR Number</span>
                  <span className="font-bold">{submittedReceipt.utr}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">Current Status</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    Pending Verification
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={onOpenWallet}
                  className="btn-shine press-scale flex-1 min-h-[48px] rounded-xl accent-btn text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <WalletIcon className="w-4 h-4" />
                  Track Status in Wallet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedReceipt(null);
                    setQrData(null);
                    setStage('select');
                  }}
                  className="press-scale min-h-[48px] px-5 rounded-xl studio-muted border text-xs sm:text-sm font-bold cursor-pointer"
                >
                  New Deposit
                </button>
              </div>
            </div>
          ) : stage === 'checkout' && qrData ? (
            <div className="space-y-6 animate-fade-up">
              {/* Top Priority: Step 2 UTR Input Form Always Placed First */}
              <form
                onSubmit={handleSubmitUtr}
                className="studio-card rounded-2xl p-5 sm:p-6 space-y-4 border-2 border-[var(--accent-primary)]/40 animate-modal-pop"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--accent-primary)]">
                    Enter 12-Digit UTR / UPI Reference Number *
                  </label>
                  <span className="text-xs font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    Payable: {formatCurrency(qrData.amount)}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="Enter 12-digit UTR after paying via UPI (e.g. 432918273645)"
                    className="studio-input flex-1 px-4 py-3 min-h-[52px] rounded-xl font-mono text-base font-bold tabular-nums"
                  />
                  <button
                    type="submit"
                    className="btn-shine press-scale min-h-[52px] px-6 rounded-xl accent-btn text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Submit UTR ({formatCurrency(qrData.amount)})
                  </button>
                </div>
              </form>

              {/* Below UTR Form: Animated QR Code Terminal & Settlement Instructions */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 space-y-4">
                  <div className="ink-card rounded-2xl p-6 text-white text-center space-y-4">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-blue-400 font-bold uppercase tracking-wider">
                        Scan & Pay via UPI
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border tabular-nums font-bold ${
                          secondsLeft <= 60
                            ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                            : 'bg-white/10 border-white/15 text-emerald-300'
                        }`}
                      >
                        {mm}:{ss}
                      </span>
                    </div>

                    {/* Animated QR Box with Moving Laser Scanline */}
                    <div className="relative w-52 h-52 mx-auto bg-white p-3.5 rounded-2xl shadow-lg overflow-hidden">
                      <img
                        src={qrData.qrDataUrl}
                        alt={`UPI QR Code for ${formatCurrency(qrData.amount)}`}
                        className="w-full h-full object-contain"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute left-3 right-3 top-2 h-1 rounded-full bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_12px_rgba(59,130,246,0.9)] animate-qr-laser pointer-events-none"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">Exact Payable Amount</div>
                      <div className="text-3xl font-extrabold font-mono tabular-nums text-emerald-400 mt-0.5">
                        {formatCurrency(qrData.amount)}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs">
                        <div className="text-left min-w-0">
                          <div className="text-[10px] text-slate-400">{qrData.payeeName}</div>
                          <div className="font-mono font-bold text-white truncate">
                            {qrData.upiId}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyUpi(qrData.upiId)}
                          className="press-scale min-h-[34px] px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {copiedUpi ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedUpi ? 'Copied' : 'Copy'}
                        </button>
                      </div>

                      <a
                        href={qrData.upiUri}
                        className="btn-shine press-scale min-h-[44px] w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center gap-2"
                      >
                        <Smartphone className="w-4 h-4" />
                        Open Installed UPI App
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStage('select');
                      setQrData(null);
                    }}
                    className="w-full min-h-[42px] rounded-xl studio-muted border text-xs font-bold cursor-pointer"
                  >
                    Change Deposit Amount
                  </button>
                </div>

                <div className="lg:col-span-7 space-y-5">
                  <div className="studio-muted border rounded-2xl p-6 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      How Gateway Settlement Works
                    </div>
                    <ol className="space-y-2.5 text-xs sm:text-sm text-[var(--text-secondary)] list-decimal list-inside">
                      <li>Scan the QR code below with PhonePe, GPay, Paytm, or any UPI app.</li>
                      <li>
                        Complete the payment of{' '}
                        <strong className="text-[var(--text-primary)] font-mono">
                          {formatCurrency(qrData.amount)}
                        </strong>{' '}
                        and copy your 12-digit UTR / Reference Number.
                      </li>
                      <li>
                        Paste your UTR in the top box above and tap Submit. Admin reviews every request manually before crediting coins.
                      </li>
                    </ol>
                    {qrData.instructions && (
                      <div className="pt-3 border-t studio-divider text-xs text-[var(--text-secondary)]">
                        {qrData.instructions}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Stage 1: Amount Selector */
            <form onSubmit={handleGenerateSubmit} className="max-w-xl mx-auto space-y-6 animate-fade-up">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Quick Amount Presets
                  </label>
                  {paymentSettings && (
                    <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                      Range: {formatCurrency(paymentSettings.minDeposit)} –{' '}
                      {formatCurrency(paymentSettings.maxDeposit)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountInput(amt)}
                      className={`press-scale min-h-[46px] rounded-xl border text-xs font-mono font-bold tabular-nums cursor-pointer transition-all ${
                        amountInput === amt
                          ? 'accent-btn border-transparent shadow-sm'
                          : 'studio-muted text-[var(--text-primary)]'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  Custom Deposit Amount (INR)
                </label>
                <input
                  type="number"
                  required
                  min={paymentSettings?.minDeposit || 1}
                  max={paymentSettings?.maxDeposit || 50000}
                  step="1"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="studio-input w-full px-4 py-3 min-h-[54px] rounded-xl font-mono text-2xl font-extrabold tabular-nums"
                />
              </div>

              <button
                type="submit"
                className="btn-shine press-scale w-full min-h-[52px] rounded-xl accent-btn text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                Generate Dynamic Payment QR
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
