import React from "react";

/* Inline-SVG icons ported 1:1 from the prototype (ICONS in dashboard-content.js,
   ic in dashboard-company.js). Contour style, stroke 1.6, no emoji. */

export const ICON_PATHS: Record<string, string> = {
  coins:
    '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/>',
  wallet:
    '<rect x="3" y="5.5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  cash:
    '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/>',
  car:
    '<path d="M5 11l1.4-4A2 2 0 0 1 8.3 5.6h7.4a2 2 0 0 1 1.9 1.4L19 11"/><path d="M3.5 11h17v4.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z"/><path d="M7 14h.5M16.5 14h.5"/>',
  gem:
    '<path d="M6 4h12l3 4.5-9 11.5L3 8.5z"/><path d="M3 8.5h18"/><path d="M9 4 8 8.5 12 20l4-11.5L15 4"/>',
  spend:
    '<polyline points="3 8 9 14 13 10 21 17"/><polyline points="21 12 21 17 16 17"/>',
  divid:
    '<circle cx="12" cy="8.5" r="4.5"/><path d="M12 6.5v4M10 8.5h4"/><path d="M5 18.5h14"/>',
  box:
    '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  phone:
    '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/><path d="M9 21v-3h6v3"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  grid:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  trend: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="21 11 21 7 17 7"/>',
  receipt:
    '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.3 2.2a7.6 7.6 0 0 0-2.6 1.5l-2-.8L3.1 8.2 4.8 9.5a7.8 7.8 0 0 0 0 3l-1.7 1.3 1.9 3.3 2-.8a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.3-2.2a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.9-3.3z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6"/><polyline points="20 4 20 11 13 11"/>',
  back: '<polyline points="15 5 8 12 15 19"/>',
  sliders:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"/>',
};

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }}
    />
  );
}
