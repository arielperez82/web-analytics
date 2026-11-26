import { Badge } from "@/ds/Badge";
import { deltaOf } from "@/lib/delta";
import { type Spoken, spokenSignedPercent } from "@/lib/format";

export const ChangeBadge = ({
  change,
  percent,
  higherIsBetter,
  amount,
}: {
  readonly change: number;
  readonly percent?: number | null;
  readonly higherIsBetter: boolean;
  readonly amount: (value: number) => Spoken;
}) => {
  const delta = deltaOf({ change, higherIsBetter });
  const figure = amount(change);
  const share = typeof percent === "number" ? spokenSignedPercent(percent) : undefined;
  const text = share === undefined ? figure.text : `${figure.text} (${share.text})`;
  const spoken = share === undefined ? figure.spoken : `${figure.spoken}, ${share.spoken}`;
  return (
    <Badge tone={delta.tone} arrow={delta.arrow} word={delta.word}>
      <span aria-hidden="true">{text}</span>
      <span className="ds-sr">{spoken}</span>
    </Badge>
  );
};
