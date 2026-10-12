export function HeadphonesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M7 18v-3a9 9 0 0 1 18 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <rect x="2.5" y="15.5" width="10" height="14" rx="4.5" fill="var(--safe)" stroke="currentColor" strokeWidth="2" />
      <rect x="19.5" y="15.5" width="10" height="14" rx="4.5" fill="var(--safe)" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 20.5v4M24.5 20.5v4" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChromeIcon() {
  return <span className="chrome-ico" aria-hidden="true" />;
}
