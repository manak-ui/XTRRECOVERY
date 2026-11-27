export const ADMIN_PHONE = '7986911808';

export interface PrefilledBanNotice {
  id: string;
  reason: string;
  notice: string;
}

export const PREFILLED_BAN_NOTICES: PrefilledBanNotice[] = [
  {
    id: 'bot_cheating',
    reason: 'Cheating / Automated Tools',
    notice: 'Account suspended due to detection of automated scripts, bots, or unauthorized third-party tools during gameplay.',
  },
  {
    id: 'multi_account',
    reason: 'Multiple Account Abuse',
    notice: 'Account suspended for operating multiple linked accounts in violation of our single-account fair play policy.',
  },
  {
    id: 'suspicious_finance',
    reason: 'Suspicious Financial Activity',
    notice: 'Account restricted due to unusual deposit patterns or unverified transaction activity pending compliance review.',
  },
  {
    id: 'fake_utr',
    reason: 'Repeated Invalid Payment Claims',
    notice: 'Account suspended for submitting invalid, duplicated, or unverified UPI UTR reference numbers.',
  },
  {
    id: 'exploit_abuse',
    reason: 'Platform Exploit Abuse',
    notice: 'Account suspended for intentionally attempting to exploit game logic, timing flaws, or platform mechanics.',
  },
  {
    id: 'api_tampering',
    reason: 'Unauthorized Client Tampering',
    notice: 'Account permanently suspended following detected attempts to alter client requests, wallet payloads, or restricted endpoints.',
  },
  {
    id: 'tos_violation',
    reason: 'Terms of Service Violation',
    notice: 'Account suspended for breaching platform Terms of Service and fair-usage guidelines.',
  },
  {
    id: 'abusive_conduct',
    reason: 'Abusive Conduct or Spam',
    notice: 'Account suspended due to abusive communication, harassment, or repeated spam activity.',
  },
  {
    id: 'verification_failure',
    reason: 'Account Verification Failure',
    notice: 'Account temporarily suspended pending verification of registered phone number and email ownership.',
  },
  {
    id: 'security_lock',
    reason: 'Security Protection Lock',
    notice: 'Account locked as a precautionary security safeguard due to suspicious sign-in attempts from unrecognized devices.',
  },
];
