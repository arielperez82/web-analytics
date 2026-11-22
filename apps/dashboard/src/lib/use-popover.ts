import { useRef, useState } from "react";

import { useDismiss } from "./use-dismiss";

export const usePopover = () => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useDismiss({
    open,
    within: container,
    onEscape: close,
    onOutside: () => {
      setOpen(false);
      window.setTimeout(() => {
        if (document.activeElement === document.body) trigger.current?.focus();
      }, 0);
    },
  });
  return { open, container, trigger, close, show: () => setOpen(true), toggle: () => (open ? close() : setOpen(true)) };
};
