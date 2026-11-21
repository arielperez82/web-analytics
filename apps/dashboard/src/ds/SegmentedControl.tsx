import { Button } from "./Button";

export type SegmentedOption<Value extends string> = {
  readonly value: Value;
  readonly label: string;
  readonly disabled?: boolean;
};

export const SegmentedControl = <Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly SegmentedOption<Value>[];
  readonly onChange: (value: Value) => void;
}) => (
  <div className="ds-seg" role="group" aria-label={label}>
    {options.map((option) => (
      <Button
        key={option.value}
        pressed={option.value === value}
        disabled={option.disabled}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </Button>
    ))}
  </div>
);
