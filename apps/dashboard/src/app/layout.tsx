import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { THEME_SCRIPT } from "@/lib/theme-script";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata = { title: "Web Analytics" };

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={inter.variable} suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
    </head>
    <body>{children}</body>
  </html>
);

export default RootLayout;
