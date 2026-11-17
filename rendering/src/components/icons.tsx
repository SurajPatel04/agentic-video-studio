/**
 * Extra device icons that lucide does not have, drawn in the same style:
 * 24×24 viewBox, outline only, round caps/joins, colour = `color` (currentColor).
 */
import type {FC, ReactNode} from 'react';

export type IconProps = {size?: number | string; color?: string; strokeWidth?: number | string; opacity?: number};

const Svg: FC<IconProps & {children: ReactNode}> = ({size = 24, color = 'currentColor', strokeWidth = 2, opacity, children}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" opacity={opacity}>
    {children}
  </svg>
);

/** Box with status lights and a cable port. */
export const ModemIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="2" y="9" width="20" height="9" rx="2" />
    <path d="M6 13.5h.01M9 13.5h.01M12 13.5h.01" />
    <path d="M16 13.5h3" />
    <path d="M5 18v2M19 18v2" />
    <path d="M9 9V6.5a3 3 0 0 1 6 0V9" />
  </Svg>
);

/** Central box with devices wired around it (all share one connection). */
export const HubIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" />
    <path d="M12 8.5V5M12 15.5V19M8.5 12H5M15.5 12H19" />
    <circle cx="12" cy="3.5" r="1.5" />
    <circle cx="12" cy="20.5" r="1.5" />
    <circle cx="3.5" cy="12" r="1.5" />
    <circle cx="20.5" cy="12" r="1.5" />
  </Svg>
);

/** Coaxial cable cut-away: jacket, shield, insulator, copper core. */
export const CoaxIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M2 15c4 0 5-3 9-3" />
    <path d="M2 19c5 0 6-3 10-3" />
    <circle cx="16" cy="12" r="6" />
    <circle cx="16" cy="12" r="3.6" strokeDasharray="1.6 1.4" />
    <circle cx="16" cy="12" r="1.2" />
  </Svg>
);

/** Fibre-optic cable: strands ending in points of light. */
export const FibreIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M2 20c4-1 6-4 8-8" />
    <path d="M10 12c1.5-3 4-6 7-7.5M10 12c2-1.5 5-2.5 8.5-2.5M10 12c2.5 0 5.5 1 8 3" />
    <circle cx="18.5" cy="4.2" r="1" />
    <circle cx="20" cy="9.5" r="1" />
    <circle cx="19.5" cy="15.5" r="1" />
    <path d="M21.5 3l.8-.8M22.5 9.5h1M22 16.5l.8.6" />
  </Svg>
);

/** Undersea cable: two coastlines joined by a cable along the sea floor, waves above. */
export const UnderseaCableIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M1 7c1.3 0 1.3-1.2 2.6-1.2S4.9 7 6.2 7s1.3-1.2 2.6-1.2S10.1 7 11.4 7s1.3-1.2 2.6-1.2S15.3 7 16.6 7s1.3-1.2 2.6-1.2S20.5 7 23 7" />
    <path d="M1 12h3l2 10H1" />
    <path d="M23 12h-3l-2 10h5" />
    <path d="M4.5 14.5c2.5 6.5 12.5 6.5 15 0" />
    <circle cx="12" cy="19.4" r="1" />
  </Svg>
);

/** Internet service provider: building with a transmission mast and signal. */
export const IspIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="11" width="11" height="11" rx="1" />
    <path d="M6 14h1M10 14h1M6 17.5h1M10 17.5h1M7.5 22v-2.5h2V22" />
    <path d="M18.5 22l-1.5-9h3l-1.5 9" />
    <path d="M18.5 13V9" />
    <path d="M15.5 6.5a4.2 4.2 0 0 1 6 0M14 4.5a6.5 6.5 0 0 1 9 0" />
  </Svg>
);

/** Resistor: body with colour bands between two leads. */
export const ResistorIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M2 12h4M18 12h4" />
    <path d="M6 9.5C6 8 7 7.5 8 8.2c1 .6 2.5.8 4 .8s3-.2 4-.8c1-.7 2-.2 2 1.3v5c0 1.5-1 2-2 1.3-1-.6-2.5-.8-4-.8s-3 .2-4 .8c-1 .7-2 .2-2-1.3z" />
    <path d="M9.5 9.2v5.6M12 9.3v5.4M14.5 9.2v5.6" />
  </Svg>
);

/** Electrolytic capacitor: can with a polarity stripe and two legs. */
export const CapacitorIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="7" y="2.5" width="10" height="14" rx="2" />
    <path d="M7 5.5h10" />
    <path d="M14 8.5v5" />
    <path d="M10 16.5v5M14 16.5v3.5" />
    <path d="M9.2 9.8h1.6M10 9v1.6" />
  </Svg>
);

/** Hacker: hooded figure behind a laptop. */
export const HackerIcon: FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6.5 15C6.5 8 9 3 12 3s5.5 5 5.5 12" />
    <path d="M9.5 12c0-3 1.1-5 2.5-5s2.5 2 2.5 5c0 1.2-5 1.2-5 0z" />
    <path d="M10.8 10.2h.01M13.2 10.2h.01" />
    <path d="M2.5 22c.5-4 2.8-6.3 5-7M21.5 22c-.5-4-2.8-6.3-5-7" />
    <rect x="7" y="15" width="10" height="7" rx="1" />
    <circle cx="12" cy="18.5" r="1" />
  </Svg>
);
