export type SeriesRow = Readonly<Record<string, unknown>> & { readonly value: number | string };

export type SeriesPoint = {
  readonly label: string;
  readonly current: number;
  readonly previousLabel: string | null;
  readonly previous: number | null;
};

const labelOf = (row: SeriesRow | undefined, key: string): string | null =>
  row === undefined ? null : String(row[key]);

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
      current: Number(row.value),
      previousLabel: labelOf(counterpart, key),
      previous: counterpart === undefined ? null : Number(counterpart.value),
    };
  });
