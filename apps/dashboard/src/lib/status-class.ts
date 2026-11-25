export const statusClass = (status: string | number | null | undefined): string => {
  const slug =
    typeof status === "string"
      ? status.trim().toLowerCase().replace(/\s+/g, "-")
      : "";
  return `status-${slug || "unknown"}`;
};

const TONES = {
  "status-excellent": "good",
  "status-good": "good",
  "status-needs-improvement": "warn",
  "status-poor": "bad",
} as const;

export const statusTone = (status: string | number | null | undefined): "good" | "warn" | "bad" | "neutral" =>
  TONES[statusClass(status) as keyof typeof TONES] ?? "neutral";
