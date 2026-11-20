"use client";

import { useState, useSyncExternalStore } from "react";

const BROWSER_ZONES: readonly string[] =
  typeof window === "undefined" ? [] : Intl.supportedValuesOf("timeZone");
const noSubscription = () => () => undefined;
const browserZones = () => BROWSER_ZONES;
const NO_ZONES: readonly string[] = [];
const serverZones = (): readonly string[] => NO_ZONES;

const OTHER = "other";
const COMMON_ZONES: readonly { readonly zone: string; readonly label: string }[] = [
  { zone: "UTC", label: "UTC" },
  { zone: "America/New_York", label: "EST (America/New_York)" },
  { zone: "America/Los_Angeles", label: "PST (America/Los_Angeles)" },
  { zone: "Europe/Madrid", label: "CET (Europe/Madrid)" },
];

export const TimeZonePicker = ({
  zone,
  onChange,
}: {
  zone: string;
  onChange: (zone: string) => void;
}) => {
  const known = useSyncExternalStore(noSubscription, browserZones, serverZones);
  const [listing, setListing] = useState(false);
  const common = COMMON_ZONES.some((option) => option.zone === zone);
  const choose = (next: string) => {
    setListing(false);
    onChange(next);
  };
  return (
    <>
      <select
        aria-label="Time zone"
        value={zone}
        onChange={(event) => (event.target.value === OTHER ? setListing(true) : choose(event.target.value))}
      >
        {!common && <option value={zone}>{zone}</option>}
        {COMMON_ZONES.map((option) => (
          <option key={option.zone} value={option.zone}>{option.label}</option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {listing && (
        <select aria-label="All time zones" value={zone} onChange={(event) => choose(event.target.value)}>
          {Array.from(new Set(["UTC", zone, ...known])).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
    </>
  );
};
