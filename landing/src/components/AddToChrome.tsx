import { CHROME_STORE_URL } from "../config";
import { ChromeIcon } from "./icons";

type Props = { size?: "sm" | "lg"; label?: string };

export function AddToChrome({ size = "lg", label = "install extension, it's free" }: Props) {
  const external = CHROME_STORE_URL !== "#";
  return (
    <a
      className={`cta cta-${size}`}
      href={CHROME_STORE_URL}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <ChromeIcon />
      <span>{label}</span>
    </a>
  );
}
