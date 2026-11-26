import { hrefWithSearch } from "./dashboard-state";
import type { UrlSearch } from "./url-search";

export type ReplacingRouter = {
  readonly replace: (href: string, options?: { readonly scroll?: boolean }) => void;
};

export const routerUrlSearch = (router: ReplacingRouter): UrlSearch => ({
  read: () => window.location.search.slice(1),
  replace: (search) => router.replace(hrefWithSearch(window.location.pathname, search), { scroll: false }),
});
