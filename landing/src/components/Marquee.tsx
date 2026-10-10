import type { ReactNode } from "react";

// Two identical halves; the track slides -50% so the loop is seamless.
// .marquee-drift adds a scroll-linked nudge on top of the loop.
export function Marquee({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`marquee ${className}`}>
      <div className="marquee-drift">
        <div className="marquee-track">
          <div className="marquee-half">{children}</div>
          <div className="marquee-half" aria-hidden="true">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
