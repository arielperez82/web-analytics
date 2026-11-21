import type { ReactNode } from "react";

export type ButtonProps = {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly variant?: "primary";
};

export const Button = ({ children, onClick, pressed, disabled, variant }: ButtonProps) => (
  <button
    type="button"
    className={variant === "primary" ? "ds-btn ds-btn-primary" : "ds-btn"}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);
