import { useEffect } from "react";

const TYPING = "input, textarea, select, [contenteditable]";

const typingIn = (target: EventTarget | null): boolean => target instanceof Element && target.closest(TYPING) !== null;

export const useShortcuts = (bindings: Readonly<Record<string, () => void>>): void => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingIn(event.target)) return;
      bindings[event.key.toLowerCase()]?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bindings]);
};
