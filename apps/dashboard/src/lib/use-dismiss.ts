import { type RefObject, useEffect } from "react";

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
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && within.current?.contains(event.target) === false) onOutside();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, within, onEscape, onOutside]);
};
