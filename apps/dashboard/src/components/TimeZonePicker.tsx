"use client";

const zonesKnown = (): readonly string[] => Intl.supportedValuesOf("timeZone");

const optionsFor = (zone: string): readonly string[] =>
  Array.from(new Set(["UTC", zone, ...zonesKnown()]));

export const TimeZonePicker = ({
  zone,
  onChange,
}: {
  zone: string;
  onChange: (zone: string) => void;
}) => (
  <select aria-label="Time zone" value={zone} onChange={(event) => onChange(event.target.value)}>
    {optionsFor(zone).map((name) => (
      <option key={name} value={name}>{name}</option>
    ))}
  </select>
);
