import { useEffect, useRef } from "react";

const OWNS_KEYS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]';

const keysBelongToTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(OWNS_KEYS) !== null;

export const useShortcuts = (bindings: Readonly<Record<string, () => void>>): void => {
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (keysBelongToTarget(event.target)) return;
      latest.current[event.key.toLowerCase()]?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
};
