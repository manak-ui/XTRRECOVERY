import React from 'react';

interface AiPassBadgeProps {
  active?: boolean;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  className?: string;
  title?: string;
}

export const AiPassBadge: React.FC<AiPassBadgeProps> = ({
  active,
  size = 'sm',
  label = 'AI PASS',
  className = '',
  title = 'Active AI PASS Membership',
}) => {
  if (!active) return null;

  const sizeStyles =
    size === 'xs'
      ? 'px-1.5 py-[2px] gap-1 text-[9px]'
      : size === 'md'
      ? 'px-3 py-1 gap-1.5 text-[11px]'
      : 'px-2 py-[3px] gap-1 text-[10px]';

  const iconSize = size === 'xs' ? 10 : size === 'md' ? 14 : 11;

  return (
    <span
      className={`ai-pass-badge shrink-0 select-none ${className}`}
      title={title}
      aria-label="AI PASS Active"
    >
      <span className={`ai-pass-badge-inner ${sizeStyles}`}>
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]"
        >
          <defs>
            <linearGradient id="aiPassCrownGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="50%" stopColor="#00f2ff" />
              <stop offset="100%" stopColor="#e879f9" />
            </linearGradient>
          </defs>
          <path
            d="M12 2L14.6 7.8L20.8 8.6L16.1 12.8L17.4 19L12 15.8L6.6 19L7.9 12.8L3.2 8.6L9.4 7.8L12 2Z"
            fill="url(#aiPassCrownGrad)"
          />
          <circle cx="12" cy="11.5" r="2.1" fill="#090d1c" />
          <circle cx="12" cy="11.5" r="1" fill="#fef08a" />
        </svg>
        <span className="font-orbitron bg-gradient-to-r from-amber-200 via-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">
          {label}
        </span>
      </span>
    </span>
  );
};
