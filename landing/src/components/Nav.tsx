import { useEffect, useState } from "react";
import { AddToChrome } from "./AddToChrome";
import { ShieldIcon } from "./icons";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="scroll-progress" aria-hidden="true" />
      <div className="nav-inner">
        <a className="wordmark" href="#top">
          <ShieldIcon size={22} />
          streamsafe
        </a>
        <nav className="nav-links">
          <a href="#how">how it works</a>
          <a href="#try">try it</a>
        </nav>
        <AddToChrome size="sm" label="install extension" />
      </div>
    </header>
  );
}
