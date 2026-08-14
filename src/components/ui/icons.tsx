import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Plus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const Search = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </Base>
);

export const Tag = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 12.5 11 5h6.5v6.5L10 19a2.1 2.1 0 0 1-3 0l-3.5-3.5a2.1 2.1 0 0 1 0-3Z" />
    <circle cx="14.2" cy="9.2" r="1.3" />
  </Base>
);

export const Book = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5A2.5 2.5 0 0 0 6.5 23H20" />
    <path d="M9 7.5h7" />
  </Base>
);

export const Bulb = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1.3 1.3-1.5 2.1h-4c-.2-.8-.7-1.5-1.5-2.1A6 6 0 0 1 12 3Z" />
  </Base>
);

export const X = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const Trash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
    <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    <path d="M10 11v6M14 11v6" />
  </Base>
);

export const Pencil = (p: IconProps) => (
  <Base {...p}>
    <path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" />
    <path d="m12.5 7.5 4 4" />
  </Base>
);

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0l2.3 2.3 1.4-1.4a1.5 1.5 0 0 1 2.1 0l2.9 2.9" />
  </Base>
);

export const Grip = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

export const Sun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Base>
);

export const Moon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />
  </Base>
);

export const Monitor = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
    <path d="M9 21h6M12 17.5V21" />
  </Base>
);

export const Check = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const Sparkle = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5Z" />
  </Base>
);

export const Download = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 17.5v1.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
  </Base>
);

export const Upload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 14.5v-11" />
    <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
    <path d="M4 17.5v1.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
  </Base>
);

export const Archive = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7.5 5 6a2 2 0 0 1 1.7-.9h10.6A2 2 0 0 1 19 6l1 1.5" />
    <rect x="4" y="7" width="16" height="13" rx="2" />
    <path d="M10 11.5h4" />
  </Base>
);

export const ChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </Base>
);

export const Star = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9L6.6 19.7l1.1-6L3.2 9.4l6.1-.8L12 3Z" />
  </Base>
);

export const Clock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3.2 1.8" />
  </Base>
);

export const Cloud = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 18a4.5 4.5 0 0 1-.8-8.9 5.5 5.5 0 0 1 10.6 1.6A4 4 0 0 1 17 18H7Z" />
  </Base>
);

export const ChartBar = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20v-8M10 20V4M16 20v-6M21 20H3" />
  </Base>
);

export const QrCode = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <path d="M13.5 13.5h2.5v2.5h-2.5z" />
    <path d="M17 17h3v3h-3z" />
  </Base>
);

export const Play = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </Base>
);

export const Pause = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 5.5v13M15 5.5v13" />
  </Base>
);

export const ChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 5.5-6.5 6.5L15 18.5" />
  </Base>
);

export const Network = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="12" cy="18" r="2.6" />
    <path d="M7.8 7.2 10.6 15.6M16.2 7.2 13.4 15.6M8.2 6h7.6" />
  </Base>
);
