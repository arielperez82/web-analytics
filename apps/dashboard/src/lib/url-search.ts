export interface UrlSearch {
  readonly read: () => string;
  readonly replace: (search: string) => void;
}
