import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY, parseThemeChoice, type ThemeChoice } from "./theme";

const read = (): ThemeChoice => {
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
};

const write = (choice: ThemeChoice): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    return;
  }
};

const apply = (choice: ThemeChoice): void =>
  choice === "system"
    ? document.documentElement.removeAttribute("data-theme")
    : document.documentElement.setAttribute("data-theme", choice);

export const useTheme = () => {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => setChoice(read()), []);
  const choose = (next: ThemeChoice) => {
    setChoice(next);
    write(next);
    apply(next);
  };
  return { choice, choose };
};
