export type PathGoal = { readonly name: string; readonly path: string };
export type EventGoal = { readonly name: string; readonly event: string };
export type Goal = PathGoal | EventGoal;

export const isEventGoal = (goal: Goal): goal is EventGoal => "event" in goal;

export type ParsedGoals = {
  readonly goals: readonly Goal[];
  readonly errors: readonly string[];
};

const MAX_GOALS = 10;
const MAX_PATH_LENGTH = 200;
const MAX_NAME_LENGTH = 60;
const MAX_EVENT_LENGTH = 100;
const EVENT_NAME = /^[\w.:-]+$/;
const FORBIDDEN_PATH_CHARACTERS = /[%?#]/;

export const isValidGoalPath = (path: string): boolean =>
  path.startsWith("/") &&
  path.length <= MAX_PATH_LENGTH &&
  !FORBIDDEN_PATH_CHARACTERS.test(path);

export const isValidGoalEvent = (event: string): boolean =>
  event.length <= MAX_EVENT_LENGTH && EVENT_NAME.test(event);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toGoal = (entry: unknown, index: number): Goal | string => {
  if (!isRecord(entry)) return `Goal ${index + 1} is not an object`;
  const { name, path, event } = entry;
  const label = typeof name === "string" && name ? name : `Goal ${index + 1}`;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH)
    return `${label} needs a name of 1 to ${MAX_NAME_LENGTH} characters`;
  if (path !== undefined && event !== undefined) return `${label} needs a path or an event, not both`;
  if (event !== undefined)
    return typeof event === "string" && isValidGoalEvent(event)
      ? { name, event }
      : `${label} needs an event of 1 to ${MAX_EVENT_LENGTH} letters, digits, _ . : or -`;
  if (typeof path !== "string" || !isValidGoalPath(path))
    return `${label} needs a path starting with / and without %, ? or #, or an event`;
  return { name, path };
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

export const parseGoals = (raw: string | undefined): ParsedGoals => {
  if (!raw?.trim()) return { goals: [], errors: [] };
  const parsed = parseJson(raw);
  if (parsed === undefined)
    return { goals: [], errors: ["DASHBOARD_GOALS is not valid JSON"] };
  if (!Array.isArray(parsed))
    return { goals: [], errors: ["DASHBOARD_GOALS must be a JSON array"] };
  const results = parsed.map(toGoal);
  const valid = results.filter((result): result is Goal => typeof result !== "string");
  const invalid = results.filter((result): result is string => typeof result === "string");
  const overflow =
    valid.length > MAX_GOALS
      ? [`DASHBOARD_GOALS allows at most ${MAX_GOALS} goals; the rest were ignored`]
      : [];
  return { goals: valid.slice(0, MAX_GOALS), errors: [...invalid, ...overflow] };
};
