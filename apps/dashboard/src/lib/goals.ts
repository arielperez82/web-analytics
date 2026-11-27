import { checkEventPattern } from "./event-pattern";

export const DENOMINATORS = ["session", "visitor", "page_view", "none"] as const;
export type Denominator = (typeof DENOMINATORS)[number];
export const DEFAULT_DENOMINATOR: Denominator = "session";

export const isDenominator = (value: unknown): value is Denominator =>
  DENOMINATORS.some((denominator) => denominator === value);

type Counted = { readonly denominator?: Denominator };
export type PathGoal = Counted & { readonly name: string; readonly path: string };
export type EventGoal = Counted & { readonly name: string; readonly event: string };
export type EventPatternGoal = Counted & { readonly name: string; readonly eventPattern: string };
export type Goal = PathGoal | EventGoal | EventPatternGoal;

export const isEventGoal = (goal: Goal): goal is EventGoal => "event" in goal;
export const isEventPatternGoal = (goal: Goal): goal is EventPatternGoal => "eventPattern" in goal;

export const denominatorOf = (goal: Goal): Denominator => goal.denominator ?? DEFAULT_DENOMINATOR;

export type GoalDescription = {
  readonly query: Readonly<Record<string, string>>;
  readonly label: string;
  readonly key: string;
};

const denominatorQuery = (goal: Goal): Readonly<Record<string, string>> =>
  goal.denominator === undefined ? {} : { goal_denominator: goal.denominator };

export const describeGoal = (goal: Goal): GoalDescription => {
  if (isEventGoal(goal))
    return { query: { goal_event: goal.event, ...denominatorQuery(goal) }, label: goal.event, key: `event:${goal.event}:${denominatorOf(goal)}:${goal.name}` };
  if (isEventPatternGoal(goal))
    return {
      query: { goal_event_pattern: goal.eventPattern, ...denominatorQuery(goal) },
      label: `pattern ${goal.eventPattern}`,
      key: `pattern:${goal.eventPattern}:${denominatorOf(goal)}:${goal.name}`,
    };
  return { query: { goal_path: goal.path, ...denominatorQuery(goal) }, label: goal.path, key: `path:${goal.path}:${denominatorOf(goal)}:${goal.name}` };
};

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

const toPatternGoal = (name: string, label: string, eventPattern: unknown): EventPatternGoal | string => {
  if (typeof eventPattern !== "string") return `${label} needs an eventPattern that is text`;
  const check = checkEventPattern(eventPattern);
  return check.valid ? { name, eventPattern } : `${label} has an unsafe eventPattern: ${check.reason}`;
};

const toBaseGoal = (entry: unknown, index: number): Goal | string => {
  if (!isRecord(entry)) return `Goal ${index + 1} is not an object`;
  const { name, path, event, eventPattern } = entry;
  const label = typeof name === "string" && name ? name : `Goal ${index + 1}`;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH)
    return `${label} needs a name of 1 to ${MAX_NAME_LENGTH} characters`;
  if ([path, event, eventPattern].filter((value) => value !== undefined).length > 1)
    return `${label} needs one of a path, an event or an eventPattern, not several`;
  if (eventPattern !== undefined) return toPatternGoal(name, label, eventPattern);
  if (event !== undefined)
    return typeof event === "string" && isValidGoalEvent(event)
      ? { name, event }
      : `${label} needs an event of 1 to ${MAX_EVENT_LENGTH} letters, digits, _ . : or -`;
  if (typeof path !== "string" || !isValidGoalPath(path))
    return `${label} needs a path starting with / and without %, ? or #, or an event`;
  return { name, path };
};

const toGoal = (entry: unknown, index: number): Goal | string => {
  const goal = toBaseGoal(entry, index);
  if (typeof goal === "string" || !isRecord(entry) || entry.denominator === undefined) return goal;
  return isDenominator(entry.denominator)
    ? { ...goal, denominator: entry.denominator }
    : `${goal.name} needs a denominator of ${DENOMINATORS.slice(0, -1).join(", ")} or ${DENOMINATORS[DENOMINATORS.length - 1]}`;
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
