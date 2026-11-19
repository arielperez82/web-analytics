"use client";

import { useSyncExternalStore } from "react";

const BROWSER_ZONES: readonly string[] =
  typeof window === "undefined" ? [] : Intl.supportedValuesOf("timeZone");
const noSubscription = () => () => undefined;
const browserZones = () => BROWSER_ZONES;
const NO_ZONES: readonly string[] = [];
const serverZones = (): readonly string[] => NO_ZONES;

export const TimeZonePicker = ({
  zone,
  onChange,
}: {
  zone: string;
  onChange: (zone: string) => void;
}) => {
  const known = useSyncExternalStore(noSubscription, browserZones, serverZones);
  return (
    <select aria-label="Time zone" value={zone} onChange={(event) => onChange(event.target.value)}>
      {Array.from(new Set(["UTC", zone, ...known])).map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
};
