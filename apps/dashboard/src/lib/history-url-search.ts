import type { UrlSearch } from "./url-search";

export const hrefWithSearch = (pathname: string, search: string): string =>
  search === "" ? pathname : `${pathname}?${search}`;

export const historyUrlSearch: UrlSearch = {
  read: () => window.location.search.slice(1),
  replace: (search) => window.history.replaceState(null, "", hrefWithSearch(window.location.pathname, search)),
};
