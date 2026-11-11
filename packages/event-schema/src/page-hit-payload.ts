export type PageHitPayload = {
  readonly pathname: string;
  readonly referrer: string;
  readonly location: string;
  readonly user_agent: string;
  readonly utm_source: string;
  readonly utm_medium: string;
};

export type PageHitParseResult =
  | { readonly ok: true; readonly payload: PageHitPayload }
  | { readonly ok: false; readonly reason: string };

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (input: unknown): input is Fields =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const text = (input: unknown): string =>
  typeof input === "string" || typeof input === "number" ? String(input) : "";

const userAgent = (fields: Fields): string =>
  text(fields.user_agent) || text(fields["user-agent"]);

export const parsePageHitPayload = (input: unknown): PageHitParseResult =>
  isRecord(input)
    ? {
        ok: true,
        payload: {
          pathname: text(input.pathname),
          referrer: text(input.referrer),
          location: text(input.location),
          user_agent: userAgent(input),
          utm_source: text(input.utm_source),
          utm_medium: text(input.utm_medium),
        },
      }
    : { ok: false, reason: "payload is not an object" };
