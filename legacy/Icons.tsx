import type { SVGProps } from "react";

export type IconName =
  | "play"
  | "arrow"
  | "arrow-left"
  | "heart"
  | "pause"
  | "sound"
  | "mute"
  | "trophy"
  | "sparkle"
  | "note"
  | "check"
  | "close"
  | "clock"
  | "flame"
  | "bolt"
  | "brain"
  | "keyboard"
  | "restart"
  | "home"
  | "chevron-down"
  | "layers"
  | "target"
  | "save"
  | "lock"
  | "menu"
  | "user"
  | "users"
  | "mail"
  | "eye"
  | "eye-off"
  | "logout"
  | "shield"
  | "trash"
  | "upload"
  | "file"
  | "calendar"
  | "globe"
  | "refresh"
  | "download";

type Props = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, strokeWidth = 1.9, className, ...props }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "play":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8.2 5.4c0-.9 1-1.4 1.7-.9l8.2 5.7c.7.5.7 1.5 0 2l-8.2 5.7c-.7.5-1.7 0-1.7-.9V5.4Z" />
          <path d="M5 6.5v11" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M4 12h16M14 6l6 6-6 6" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <path d="M20 12H4M10 6l-6 6 6 6" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 20.3c-.4 0-.8-.1-1.1-.4C7.1 16.7 3 13.4 3 8.9 3 6.1 5.1 4 7.8 4c1.7 0 3.2.8 4.2 2.1C13 4.8 14.5 4 16.2 4 18.9 4 21 6.1 21 8.9c0 4.5-4.1 7.8-7.9 11-.3.3-.7.4-1.1.4Z" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="6.5" y="4.5" width="4" height="15" rx="1.4" />
          <rect x="13.5" y="4.5" width="4" height="15" rx="1.4" />
        </svg>
      );
    case "sound":
      return (
        <svg {...common}>
          <path d="M4 10v4h3l4.5 3.8c.6.5 1.5.1 1.5-.7V6.9c0-.8-.9-1.2-1.5-.7L7 10H4Z" />
          <path d="M16 9.2c.9 1.5.9 4.1 0 5.6M18.7 6.5c2 3 2 8 0 11" />
        </svg>
      );
    case "mute":
      return (
        <svg {...common}>
          <path d="M4 10v4h3l4.5 3.8c.6.5 1.5.1 1.5-.7V6.9c0-.8-.9-1.2-1.5-.7L7 10H4Z" />
          <path d="m16 9 5 6M21 9l-5 6" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 5H3.8v1.6A4.4 4.4 0 0 0 8.2 11M17 5h3.2v1.6A4.4 4.4 0 0 1 15.8 11M12 13.5V17M8 20h8M9.5 17h5l.8 3h-6.6l.8-3Z" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 2.7c.5 0 .9.3 1.1.8l1.7 4.6c.3.8.9 1.4 1.7 1.7l4.6 1.7c1 .4 1 1.8 0 2.2l-4.6 1.7c-.8.3-1.4.9-1.7 1.7l-1.7 4.6c-.4 1-1.8 1-2.2 0l-1.7-4.6c-.3-.8-.9-1.4-1.7-1.7l-4.6-1.7c-1-.4-1-1.8 0-2.2l4.6-1.7c.8-.3 1.4-.9 1.7-1.7l1.7-4.6c.2-.5.6-.8 1.1-.8Z" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <path d="M8 8h8M8 12h8M8 16h5" />
          <path d="M16.5 3.5v4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common} strokeWidth={2.6}>
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      );
    case "close":
      return (
        <svg {...common} strokeWidth={2.2}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M13.2 2.4c.4-.4 1.1-.1 1.1.4 0 2.5-1.8 3.6-1.8 5.3 0 1.1.8 1.9 1.8 1.9 1.6 0 2.6-1.4 2.6-3.1 0-.6.8-.8 1.1-.3 1 1.7 1.5 3.5 1.5 5.2 0 4.2-3.4 7.4-7.5 7.4S5 16.2 5 12.1c0-3.6 2-5.6 4.4-7.8 1.2-1.1 2.5-1.4 3.8-1.9Z" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M13.6 2.2c.5-.6 1.4-.2 1.3.5l-1.2 6.4h4.2c.6 0 .9.7.5 1.2l-8 11.5c-.4.6-1.3.2-1.2-.5l1.2-6.4H6.2c-.6 0-.9-.7-.5-1.2l7.9-11.5Z" />
        </svg>
      );
    case "brain":
      return (
        <svg {...common}>
          <path d="M12 5.2c-1-1.5-3.9-1.7-4.8.3-1.8.2-2.7 1.7-2.4 3.1-1.4 1.3-1.2 3.4.2 4.4-.4 1.8 1 3.3 2.7 3.3.5 1.7 2.8 2.3 4.3 1V5.2ZM12 5.2c1-1.5 3.9-1.7 4.8.3 1.8.2 2.7 1.7 2.4 3.1 1.4 1.3 1.2 3.4-.2 4.4.4 1.8-1 3.3-2.7 3.3-.5 1.7-2.8 2.3-4.3 1" />
          <path d="M12 8.5c-1 .8-2.6.8-3.5 0M12 12.5c.9.8 2.7.8 3.5 0M12 17.3v2.2" />
        </svg>
      );
    case "keyboard":
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5" />
        </svg>
      );
    case "restart":
      return (
        <svg {...common}>
          <path d="M3.8 10a8.4 8.4 0 1 1 .6 5.5M3.8 4.5V10h5.4" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3.5 10.5 8.5-7 8.5 7M5.5 9.5V20h13V9.5M9.8 20v-5.5h4.4V20" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="m12 3 8.5 4.6L12 12 3.5 7.6 12 3Z" />
          <path d="m4 12 8 4.4 8-4.4M4 16.4l8 4.4 8-4.4" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.7" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M4 4.8A1.8 1.8 0 0 1 5.8 3H17l4 4v13.2A1.8 1.8 0 0 1 19.2 22H5.8A1.8 1.8 0 0 1 4 20.2V4.8Z" />
          <path d="M8 3v6h7V3M8 22v-7h8v7" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4.5" y="10" width="15" height="10.5" rx="2.4" />
          <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.2" r="3.7" />
          <path d="M4.8 20c.7-4 3.6-6 7.2-6s6.5 2 7.2 6" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9.2" cy="8.5" r="3.3" />
          <path d="M3.2 19.5c.6-3.6 3-5.4 6-5.4s5.4 1.8 6 5.4M16 5.6a3 3 0 0 1 0 5.9M17.5 14.4c2.1.4 3.3 2.1 3.7 4.6" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.4" />
          <path d="m4.5 7.5 7.5 5.4 7.5-5.4" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...common}>
          <path d="m3 3 18 18M10.6 6.1A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 4M6.2 7.7A17.6 17.6 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9.5 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20h3.7M15 8l4 4-4 4M19 12H9" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2.8 20 6v6.2c0 4.6-3.4 7.6-8 9-4.6-1.4-8-4.4-8-9V6l8-3.2Z" />
          <path d="m8.6 12 2.4 2.4 4.4-4.7" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16M9.5 7V4.8h5V7M6.2 7l1 13h9.6l1-13M10 10.5v6M14 10.5v6" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 15v3.2A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.8V15" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M6 2.8h7.4L19 8.4V20a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 20V4.6A1.8 1.8 0 0 1 6 2.8Z" />
          <path d="M13.2 3v5.6H19M8 13h8M8 17h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.2" y="5" width="17.6" height="16" rx="2.4" />
          <path d="M7.6 2.8V7M16.4 2.8V7M3.2 10h17.6M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.7" />
          <path d="M3.5 12h17M12 3.3c2.3 2.5 3.5 5.4 3.5 8.7S14.3 18.2 12 20.7c-2.3-2.5-3.5-5.4-3.5-8.7S9.7 5.8 12 3.3Z" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20.2 10a8.4 8.4 0 1 0-2.1 7.3M20.2 4.5V10h-5.4" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3.5V16M7.5 11.5 12 16l4.5-4.5M4 16.5v2.2A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.3v-2.2" />
        </svg>
      );
    default:
      return null;
  }
}
