import { hrefWithSearch } from "./dashboard-state";
import type { UrlSearch } from "./url-search";

export const historyUrlSearch: UrlSearch = {
  read: () => window.location.search.slice(1),
  replace: (search) => window.history.replaceState(null, "", hrefWithSearch(window.location.pathname, search)),
};
