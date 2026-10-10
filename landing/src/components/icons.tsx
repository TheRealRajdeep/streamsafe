export function ShieldIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 3 5 7v8c0 6.8 4.6 11.9 11 14 6.4-2.1 11-7.2 11-14V7L16 3Z"
        fill="var(--safe)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m11 16 3.4 3.4L21.5 12"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChromeIcon() {
  return <span className="chrome-ico" aria-hidden="true" />;
}
