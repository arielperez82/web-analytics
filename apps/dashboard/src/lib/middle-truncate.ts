const DEFAULT_TAIL_LENGTH = 16;

export type MiddleSplit = { readonly head: string; readonly tail: string };

export const splitForMiddleTruncation = (
  value: string,
  { tailLength = DEFAULT_TAIL_LENGTH }: { readonly tailLength?: number } = {},
): MiddleSplit => {
  const characters = Array.from(value);
  return tailLength <= 0 || characters.length <= tailLength
    ? { head: value, tail: "" }
    : {
        head: characters.slice(0, -tailLength).join(""),
        tail: characters.slice(-tailLength).join(""),
      };
};
