"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const ICONS = {
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  gauge: "M4 18a8 8 0 1 1 16 0M12 18l4-6",
  chevrons: "M9 6l6 6-6 6",
} as const;

type IconName = keyof typeof ICONS;

export type SidebarNavProps = {
  readonly items: readonly {
    readonly href: string;
    readonly label: string;
    readonly icon: Exclude<IconName, "chevrons">;
    readonly active: boolean;
  }[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

const Icon = ({ name }: { readonly name: IconName }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

export const SidebarNav = ({ items, collapsed, onToggle }: SidebarNavProps) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);
  const pointer = useRef(false);
  const shown = collapsed ? (hovered ?? focused) : null;
  return (
    <nav className="sidebar" aria-label="Main" data-collapsed={collapsed} data-animate={animate}>
      <button
        type="button"
        className="ds-btn sidebar-toggle"
        aria-label="Sidebar"
        aria-expanded={!collapsed}
        onClick={() => {
          setAnimate(true);
          onToggle();
        }}
      >
        <Icon name="chevrons" />
      </button>
      <ul>
        {items.map(({ href, label, icon, active }) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => setHovered(label)}
              onMouseLeave={() => setHovered(null)}
              onPointerDown={() => {
                pointer.current = true;
              }}
              onFocus={() => {
                if (!pointer.current) setFocused(label);
                pointer.current = false;
              }}
              onBlur={() => setFocused(null)}
            >
              <Icon name={icon} />
              <span className={collapsed ? "ds-sr" : undefined}>{label}</span>
            </Link>
            {shown === label ? (
              <span role="tooltip" className="side-tip">
                {label}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
};
