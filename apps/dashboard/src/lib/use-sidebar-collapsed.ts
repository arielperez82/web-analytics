import { useEffect, useState } from "react";

const KEY = "sidebar-collapsed";

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
};

const write = (collapsed: boolean): void => {
  try {
    window.localStorage.setItem(KEY, String(collapsed));
  } catch {
    return;
  }
};

export const useSidebarCollapsed = () => {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(read()), []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    write(next);
  };
  return { collapsed, toggle };
};
