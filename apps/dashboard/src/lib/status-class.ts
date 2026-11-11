export const statusClass = (status: string | number | null | undefined): string => {
  const slug =
    typeof status === "string"
      ? status.trim().toLowerCase().replace(/\s+/g, "-")
      : "";
  return `status-${slug || "unknown"}`;
};
