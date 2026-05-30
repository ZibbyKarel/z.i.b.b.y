import type { ReactNode, SVGProps } from "react"

/** Every glyph available in the velín icon set. */
export const iconNames = [
  "grid",
  "spark",
  "plug",
  "clock",
  "brain",
  "pulse",
  "cart",
  "film",
  "server",
  "doc",
  "play",
  "run",
  "wait",
  "ok",
  "edit",
  "bolt",
  "check",
  "x",
  "stop",
  "plus",
  "chevron",
  "dots",
  "file",
  "shield",
  "search",
  "gear",
  "bot",
  "flow",
  "compass",
  "code",
  "flask",
  "dollar",
  "branch",
  "pause",
  "retry",
  "checkpoint",
  "moon",
  "coffee",
  "link",
  "warn",
  "arrow",
] as const

export type IconName = (typeof iconNames)[number]

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  /** Which glyph to render. */
  name: IconName
  /** Square size in px. */
  size?: number
  /** Stroke width. */
  stroke?: number
  ref?: React.Ref<SVGSVGElement>
}

const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  spark: <path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z" />,
  plug: (
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  brain: (
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18a3 3 0 0 0 5 .8 3 3 0 0 0 5-.8 3 3 0 0 0 2-5.2A3 3 0 0 0 18 7a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 4z" />
  ),
  pulse: <path d="M2 12h4l2.5-7 4 14 2.5-7H22" />,
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.5l2.2 12.3a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 7H6" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  doc: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4M9 13h6M9 17h6" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  run: <circle cx="12" cy="12" r="4" />,
  wait: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 1.5" />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.2 2.2 4.8-5" />
    </>
  ),
  edit: <path d="M4 20h4L20 8l-4-4L4 16z" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  check: <path d="M5 12.5l4 4 10-10.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  file: (
    <>
      <path d="M7 2h7l4 4v16H7z" />
      <path d="M14 2v4h4" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16l5 5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.5 1.5 0 0 0 .3 1.65l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20a2 2 0 0 1-4 0v-.07a1.5 1.5 0 0 0-2.55-1.06l-.05.05A2 2 0 1 1 2.84 16.1l.05-.05A1.5 1.5 0 0 0 1.83 13.5H1.7a2 2 0 0 1 0-4h.13a1.5 1.5 0 0 0 1.06-2.55l-.05-.05A2 2 0 1 1 5.7 4.07l.05.05a1.5 1.5 0 0 0 1.65.3H7.5a1.5 1.5 0 0 0 .9-1.37V3a2 2 0 0 1 4 0v.07a1.5 1.5 0 0 0 2.55 1.06l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.5 1.5 0 0 0-.3 1.65V8.5a1.5 1.5 0 0 0 1.37.9H22a2 2 0 0 1 0 4h-.07a1.5 1.5 0 0 0-1.37.9z" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9 8h6" />
      <circle cx="12" cy="3.5" r="1.3" />
    </>
  ),
  flow: (
    <>
      <rect x="3" y="4" width="6" height="5" rx="1" />
      <rect x="15" y="4" width="6" height="5" rx="1" />
      <rect x="9" y="15" width="6" height="5" rx="1" />
      <path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />,
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  dollar: (
    <path d="M12 2v20M16 6.5C16 4.6 14.2 3.5 12 3.5S8 4.6 8 6.5 9.8 9.5 12 9.5s4 1.1 4 3-1.8 3-4 3-4-1.1-4-3" />
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="M6 7.2v9.6M18 9.2c0 4-6 2.8-6 7.8" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </>
  ),
  retry: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
    </>
  ),
  checkpoint: (
    <>
      <path d="M5 21V4l7 3 7-3v17l-7-3z" />
      <path d="M12 7v14" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />,
  coffee: (
    <>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17M7 3v2M11 3v2" />
    </>
  ),
  link: (
    <>
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
}

/** Inline stroke icon, 1.6 default stroke, inherits `currentColor`. */
export function Icon({
  name,
  size = 18,
  stroke = 1.6,
  ref,
  ...props
}: IconProps) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block shrink-0"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

export interface ZibbyMarkProps extends SVGProps<SVGSVGElement> {
  size?: number
  ref?: React.Ref<SVGSVGElement>
}

/** The ZIBBY top-hat (cylindr) butler mark. */
export function ZibbyMark({ size = 22, ref, ...props }: ZibbyMarkProps) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className="block text-foreground"
      aria-hidden="true"
      {...props}
    >
      <ellipse cx="16" cy="25" rx="12" ry="2.4" fill="currentColor" opacity="0.18" />
      <path d="M9 24h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M11 24V11a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M11 19h10" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
