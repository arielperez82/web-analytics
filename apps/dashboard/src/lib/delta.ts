import { formatSignedPercent } from "./format";

export type Delta = {
  readonly arrow: "up" | "down" | "flat";
  readonly tone: "good" | "bad" | "neutral";
  readonly word: "Up" | "Down" | "No change";
};

const FLAT: Delta = { arrow: "flat", tone: "neutral", word: "No change" };

export const deltaOf = ({ percent, higherIsBetter }: { readonly percent: number; readonly higherIsBetter: boolean }): Delta => {
  if (!Number.isFinite(percent) || formatSignedPercent(percent) === "0%") return FLAT;
  const rising = percent > 0;
  return {
    arrow: rising ? "up" : "down",
    tone: rising === higherIsBetter ? "good" : "bad",
    word: rising ? "Up" : "Down",
  };
};
