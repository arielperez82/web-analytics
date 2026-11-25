const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const signedNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
const signedSeconds = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
  style: "unit",
  unit: "second",
  unitDisplay: "narrow",
});
const seconds = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "unit",
  unit: "second",
  unitDisplay: "narrow",
});

export const APPROXIMATE_COUNT_NOTE = "Exact for small counts, within 1% for large ones.";

export const formatNumber = (value: number): string => number.format(value);

export const formatPercent = (value: number): string => `${number.format(value)}%`;

export const formatSignedPercent = (value: number): string => `${signedNumber.format(value)}%`;

export const formatSignedNumber = (value: number): string => signedNumber.format(value);

export const formatSignedPoints = (value: number): string => `${signedNumber.format(value)} pp`;

export const formatSignedSeconds = (value: number): string => signedSeconds.format(value);

export const formatSeconds = (value: number): string => seconds.format(value);
