import type { ReactNode } from "react";

export const PageHeader = ({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children?: ReactNode;
}) => (
  <header className="page-head">
    <div>
      <h1>{title}</h1>
      <p className="page-sub">{subtitle}</p>
    </div>
    <div className="page-actions">{children}</div>
  </header>
);
