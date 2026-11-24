export type SeriesRow = Readonly<Record<string, unknown>> & { readonly value: number | string | null };

export type SeriesPoint = {
  readonly label: string;
  readonly current: number | null;
  readonly previousLabel: string | null;
  readonly previous: number | null;
};

const labelOf = (row: SeriesRow | undefined, key: string): string | null =>
  row === undefined ? null : String(row[key]);

const numberOf = (value: number | string | null): number | null => (value === null ? null : Number(value));

export const alignSeries = ({
  key,
  current,
  previous,
}: {
  readonly key: string;
  readonly current: readonly SeriesRow[];
  readonly previous: readonly SeriesRow[] | undefined;
}): readonly SeriesPoint[] =>
  current.map((row, index) => {
    const counterpart = previous?.[index];
    return {
      label: String(row[key]),
      current: numberOf(row.value),
      previousLabel: labelOf(counterpart, key),
      previous: counterpart === undefined ? null : numberOf(counterpart.value),
    };
  });
