import type { ReactNode } from "react";

export type ButtonProps = {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
};

export const Button = ({ children, onClick, pressed, disabled }: ButtonProps) => (
  <button
    type="button"
    className="ds-btn"
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);
