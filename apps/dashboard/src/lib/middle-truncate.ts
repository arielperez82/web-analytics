const DEFAULT_TAIL_LENGTH = 16;

export type MiddleSplit = { readonly head: string; readonly tail: string };

export const splitForMiddleTruncation = (
  value: string,
  { tailLength = DEFAULT_TAIL_LENGTH }: { readonly tailLength?: number } = {},
): MiddleSplit =>
  value.length <= tailLength
    ? { head: value, tail: "" }
    : { head: value.slice(0, -tailLength), tail: value.slice(-tailLength) };
