"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { historyUrlSearch } from "./history-url-search";
import { routerUrlSearch } from "./router-url-search";
import type { UrlSearch } from "./url-search";

const UrlSearchContext = createContext<UrlSearch>(historyUrlSearch);

export const UrlSearchProvider = UrlSearchContext.Provider;

export const useUrlSearch = (): UrlSearch => useContext(UrlSearchContext);

export const RouterUrlSearch = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const urlSearch = useMemo(() => routerUrlSearch(router), [router]);
  return <UrlSearchProvider value={urlSearch}>{children}</UrlSearchProvider>;
};
