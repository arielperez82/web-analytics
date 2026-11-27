"use client";

import { SegmentedControl, type SegmentedOption } from "@/ds/SegmentedControl";
import type { ThemeChoice } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

const OPTIONS: readonly SegmentedOption<ThemeChoice>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "contrast", label: "High contrast" },
];

export const ThemeSwitcher = () => {
  const { choice, choose } = useTheme();
  return <SegmentedControl label="Theme" value={choice} options={OPTIONS} onChange={choose} />;
};
