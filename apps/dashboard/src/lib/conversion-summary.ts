export type ConversionRow = {
  readonly channel: string;
  readonly visits: number | string;
  readonly conversions: number | string;
  readonly conversion_rate: number | string;
};

export type ChannelConversion = {
  readonly channel: string;
  readonly visits: number;
  readonly conversions: number;
  readonly rate: number;
};

export type ConversionSummary = {
  readonly visits: number;
  readonly conversions: number;
  readonly rate: number;
  readonly channels: readonly ChannelConversion[];
};

const rateOf = (conversions: number, visits: number): number =>
  visits === 0 ? 0 : conversions / visits;

export const summarizeConversions = (rows: readonly ConversionRow[]): ConversionSummary => {
  const channels = rows
    .map((row) => ({
      channel: row.channel,
      visits: Number(row.visits),
      conversions: Number(row.conversions),
      rate: Number(row.conversion_rate),
    }))
    .toSorted((a, b) => b.conversions - a.conversions || b.visits - a.visits);
  const visits = channels.reduce((sum, c) => sum + c.visits, 0);
  const conversions = channels.reduce((sum, c) => sum + c.conversions, 0);
  return { visits, conversions, rate: rateOf(conversions, visits), channels };
};
