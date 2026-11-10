export type ConsentState = 'denied' | 'granted' | 'unknown';
export type AnonymousIdentity = 'client' | 'proxy';
export type IdMode = 'anonymous' | 'daily_direct' | 'persistent';

type ScreenInfo = {
  readonly height: number;
  readonly pixelRatio: number;
  readonly width: number;
};

export type DailyIdentityInput = {
  readonly domain: string;
  readonly language: string;
  readonly now: Date;
  readonly screen: ScreenInfo;
  readonly timeZone: string;
  readonly userAgent: string;
};

export type DailyIdentity = {
  readonly sessionId: string;
  readonly visitorId: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_WINDOW_MS = 30 * 60 * 1000;
const FNV_PRIME = 16_777_619;
const FIRST_SEED = 2_166_136_261;
const SECOND_SEED = 0x97_47_b2_8c;

export const resolveIdMode = ({
  anonymousIdentity,
  consent,
}: {
  readonly anonymousIdentity: AnonymousIdentity;
  readonly consent: ConsentState;
}): IdMode => {
  if (consent === 'granted') return 'persistent';
  return anonymousIdentity === 'proxy' ? 'anonymous' : 'daily_direct';
};

const fnv1a = (seed: number, text: string): number =>
  [...text].reduce(
    (hash, char) =>
      Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    seed
  );

const toHex = (value: number): string => value.toString(16).padStart(8, '0');

const hash64 = (text: string): string =>
  `${toHex(fnv1a(FIRST_SEED, text))}${toHex(fnv1a(SECOND_SEED, text))}`;

export const dailyIdentity = ({
  domain,
  language,
  now,
  screen,
  timeZone,
  userAgent,
}: DailyIdentityInput): DailyIdentity => {
  const visitorId = hash64(
    [
      'visitor',
      Math.floor(now.getTime() / DAY_MS),
      domain,
      userAgent,
      screen.width,
      screen.height,
      screen.pixelRatio,
      language,
      timeZone,
    ].join('|')
  );
  const sessionId = hash64(
    ['session', visitorId, Math.floor(now.getTime() / SESSION_WINDOW_MS)].join(
      '|'
    )
  );
  return { sessionId, visitorId };
};
