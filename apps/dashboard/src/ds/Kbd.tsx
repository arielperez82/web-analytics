import type { ReactNode } from "react";

export const Kbd = ({ children }: { readonly children: ReactNode }) => (
  <kbd className="ds-kbd" aria-hidden="true">
    {children}
  </kbd>
);
