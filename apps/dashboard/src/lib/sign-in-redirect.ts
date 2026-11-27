type Place = {
  readonly pathname: string;
  readonly search: string;
  readonly assign: (url: string) => void;
};

export const signInUrl = (pathname: string, search: string): string =>
  `/login?${new URLSearchParams([["callbackUrl", `${pathname}${search}`]]).toString()}`;

export const redirectToSignIn = (status: number | undefined, place: Place): boolean => {
  if (status !== 401) return false;
  place.assign(signInUrl(place.pathname, place.search));
  return true;
};
