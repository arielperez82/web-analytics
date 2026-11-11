import { t } from "@tinybirdco/sdk";

export const analyticsEventsColumns = {
  timestamp: t.dateTime(),
  session_id: t.string().nullable(),
  action: t.string().lowCardinality(),
  version: t.string().lowCardinality(),
  payload: t.string(),
  tenant_id: t.string().default(""),
  domain: t.string().default(""),
};
