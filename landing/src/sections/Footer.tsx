import { HeadphonesIcon } from "../components/icons";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <a className="wordmark" href="#top">
          <HeadphonesIcon size={20} />
          earmuffs
        </a>
        <p className="footer-privacy">
          stream audio is sent to a speech-to-text service only to find swears. earmuffs has no servers of its own and
          keeps nothing. works on twitch live streams and native twitch chat.
        </p>
        <p className="footer-meta">made at a hackathon with ♥ · © 2026 earmuffs</p>
      </div>
    </footer>
  );
}
