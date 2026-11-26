const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const signedNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
const signedSeconds = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "unit",
  unit: "second",
  unitDisplay: "narrow",
});
const signedPercentInWords = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "unit",
  unit: "percent",
  unitDisplay: "long",
});
const signedSecondsInWords = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "unit",
  unit: "second",
  unitDisplay: "long",
});
const signedMillisecondsInWords = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "unit",
  unit: "millisecond",
  unitDisplay: "long",
});
const seconds = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "unit",
  unit: "second",
  unitDisplay: "narrow",
});
const plural = new Intl.PluralRules("en-US", { maximumFractionDigits: 2 });
const SIGN_WORDS: ReadonlyMap<string, string> = new Map([
  ["plusSign", "plus "],
  ["minusSign", "minus "],
]);

const speak = ({ formatter, value }: { readonly formatter: Intl.NumberFormat; readonly value: number }): string =>
  formatter
    .formatToParts(value)
    .map((part) => SIGN_WORDS.get(part.type) ?? part.value)
    .join("");

export type Spoken = { readonly text: string; readonly spoken: string };

export const APPROXIMATE_COUNT_NOTE = "Exact for small counts, within 1% for large ones.";

export const formatNumber = (value: number): string => number.format(value);

export const formatPercent = (value: number): string => `${number.format(value)}%`;

export const formatSignedPercent = (value: number): string => `${signedNumber.format(value)}%`;

export const formatSignedNumber = (value: number): string => signedNumber.format(value);

export const spokenSignedNumber = (value: number): Spoken => ({
  text: formatSignedNumber(value),
  spoken: speak({ formatter: signedNumber, value }),
});

export const spokenSignedPercent = (value: number): Spoken => ({
  text: formatSignedPercent(value),
  spoken: speak({ formatter: signedPercentInWords, value }),
});

export const spokenSignedPoints = (value: number): Spoken => ({
  text: `${signedNumber.format(value)} pp`,
  spoken: `${speak({ formatter: signedNumber, value })} percentage ${plural.select(value) === "one" ? "point" : "points"}`,
});

export const spokenSignedMilliseconds = (value: number): Spoken => ({
  text: formatSignedNumber(value),
  spoken: speak({ formatter: signedMillisecondsInWords, value }),
});

export const spokenSignedScorePoints = (value: number): Spoken => ({
  text: formatSignedNumber(value),
  spoken: `${speak({ formatter: signedNumber, value })} ${plural.select(value) === "one" ? "point" : "points"}`,
});

export const spokenSignedSeconds = (value: number): Spoken => ({
  text: signedSeconds.format(value),
  spoken: speak({ formatter: signedSecondsInWords, value }),
});

export const formatSeconds = (value: number): string => seconds.format(value);
