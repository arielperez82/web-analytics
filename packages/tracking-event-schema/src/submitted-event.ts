export type SubmittedEvent = {
  readonly timestamp: string;
  readonly session_id?: string;
  readonly action: string;
  readonly version: string;
  readonly payload: string;
  readonly tenant_id?: string;
  readonly domain?: string;
  readonly reception_timestamp?: never;
};
