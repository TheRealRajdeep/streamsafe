import type { ReactNode } from "react";

type Props = { title?: string; className?: string; dark?: boolean; children: ReactNode };

export function WindowFrame({ title, className = "", dark = false, children }: Props) {
  return (
    <div className={`window ${dark ? "window-dark" : ""} ${className}`}>
      <div className="window-bar">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {title && <span className="window-title">{title}</span>}
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
