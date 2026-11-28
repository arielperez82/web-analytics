export const THEME_CHOICES = ["system", "light", "dark", "contrast"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_STORAGE_KEY = "theme";

const isThemeChoice = (raw: string): raw is ThemeChoice =>
  THEME_CHOICES.some((choice) => choice === raw);

export const parseThemeChoice = (raw: string | null | undefined): ThemeChoice =>
  raw !== null && raw !== undefined && isThemeChoice(raw) ? raw : "system";
