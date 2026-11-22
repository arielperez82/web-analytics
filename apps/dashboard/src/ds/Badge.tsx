import type { ReactNode } from "react";

const GLYPHS = { up: "▲", down: "▼", flat: "–" } as const;

export type BadgeProps = {
  readonly tone: "good" | "warn" | "bad" | "neutral";
  readonly arrow?: keyof typeof GLYPHS;
  readonly word?: string;
  readonly children: ReactNode;
};

export const Badge = ({ tone, arrow, word, children }: BadgeProps) => (
  <span className="ds-badge" data-tone={tone}>
    {arrow === undefined ? null : <span aria-hidden="true">{GLYPHS[arrow]}</span>}
    {word === undefined ? null : <span className="ds-sr">{word}</span>}
    {children}
  </span>
);
