import { type RefObject, useEffect, useRef } from "react";

export const useDismiss = ({
  open,
  within,
  onEscape,
  onOutside,
}: {
  readonly open: boolean;
  readonly within: RefObject<HTMLElement | null>;
  readonly onEscape: () => void;
  readonly onOutside: () => void;
}): void => {
  const latest = useRef({ onEscape, onOutside });
  useEffect(() => {
    latest.current = { onEscape, onOutside };
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) latest.current.onEscape();
    };
    const onOutsideEvent = (event: Event) => {
      if (event.target instanceof Node && within.current?.contains(event.target) === false) latest.current.onOutside();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutsideEvent);
    document.addEventListener("focusin", onOutsideEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutsideEvent);
      document.removeEventListener("focusin", onOutsideEvent);
    };
  }, [open, within]);
};
