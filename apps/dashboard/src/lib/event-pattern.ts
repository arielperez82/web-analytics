export const EVENT_PATTERN_MAX_LENGTH = 100;
export const EVENT_PATTERN_MAX_REPEAT = 20;

export type PatternCheck = { readonly valid: true } | { readonly valid: false; readonly reason: string };

type Failure = { readonly error: string };
type Step = { readonly index: number; readonly quantified: boolean };
type Atom = Step & { readonly anchor: boolean; readonly group: boolean };
type Parsed<T> = T | Failure;

const failure = (error: string): Failure => ({ error });
const failed = <T extends object>(value: Parsed<T>): value is Failure => "error" in value;

const PRINTABLE_ASCII_WITHOUT_SPACE = /^[\x21-\x7e]+$/;
const QUANTIFIER_START = /[*+?{]/;
const CLASS_ESCAPES = "dwsDWS";
const ESCAPABLE_PUNCTUATION = ".[](){}|*+?^$-:/\\";
const REPEAT_NUMBER = /^\d{1,9}$/;

const parseEscape = (pattern: string, index: number): Parsed<{ readonly index: number }> => {
  const escaped = pattern[index + 1];
  if (escaped === undefined) return failure("a pattern cannot end with a backslash");
  if (/\d/.test(escaped)) return failure("backreferences are not supported");
  return CLASS_ESCAPES.includes(escaped) || ESCAPABLE_PUNCTUATION.includes(escaped)
    ? { index: index + 2 }
    : failure(`unsupported escape \\${escaped}; use \\d \\w \\s or escape a punctuation character`);
};

type ClassItem = { readonly set: boolean; readonly code: number };
type ClassState = { readonly previous: ClassItem | undefined; readonly rangeFrom: ClassItem | undefined; readonly count: number };

const RANGE_REASON = "invalid character class range: use a-z between two plain characters, in order";

const classItem = (pattern: string, position: number): ClassItem & { readonly next: number } => {
  const char = pattern[position] ?? "";
  if (char !== "\\") return { set: false, code: char.charCodeAt(0), next: position + 1 };
  const escaped = pattern[position + 1] ?? "";
  return { set: CLASS_ESCAPES.includes(escaped), code: escaped.charCodeAt(0), next: position + 2 };
};

const parseClass = (pattern: string, index: number): Parsed<{ readonly index: number }> => {
  const start = pattern[index + 1] === "^" ? index + 2 : index + 1;
  const close = (position: number, state: ClassState): Parsed<{ readonly index: number }> => {
    const char = pattern[position];
    if (char === undefined) return failure("unterminated character class");
    if (char === "]") return state.count === 0 ? failure("invalid character class: it is empty") : { index: position + 1 };
    if (char === "[") return failure("invalid character class: nested brackets and POSIX classes are not supported");
    const opensRange = char === "-" && state.previous !== undefined && state.rangeFrom === undefined && pattern[position + 1] !== "]";
    if (opensRange) return close(position + 1, { ...state, rangeFrom: state.previous, count: state.count + 1 });
    if (char === "\\") {
      const escape = parseEscape(pattern, position);
      if (failed(escape)) return escape;
    }
    const item = classItem(pattern, position);
    if (state.rangeFrom !== undefined && (state.rangeFrom.set || item.set || state.rangeFrom.code > item.code)) return failure(RANGE_REASON);
    const closesRange = state.rangeFrom !== undefined;
    return close(item.next, { previous: closesRange ? { set: true, code: 0 } : item, rangeFrom: undefined, count: state.count + 1 });
  };
  return close(start, { previous: undefined, rangeFrom: undefined, count: 0 });
};

const parseQuantifier = (pattern: string, index: number): Parsed<{ readonly index: number }> | undefined => {
  const char = pattern[index];
  if (char === undefined || !QUANTIFIER_START.test(char)) return undefined;
  if (char !== "{") return { index: index + 1 };
  const close = pattern.indexOf("}", index);
  const [lower = "", upper, ...extra] = pattern.slice(index + 1, close === -1 ? index + 1 : close).split(",");
  const numbers = [lower, ...(upper === undefined || upper === "" ? [] : [upper])];
  if (close === -1 || extra.length > 0 || !numbers.every((part) => REPEAT_NUMBER.test(part)))
    return failure("a { must start a valid quantifier such as {2} or {1,5}");
  if (upper === "") return failure("unbounded counted repeat {n,} is not supported; give an upper limit");
  const high = Number(upper ?? lower);
  if (high > EVENT_PATTERN_MAX_REPEAT) return failure(`repeat count must be at most ${EVENT_PATTERN_MAX_REPEAT}`);
  if (Number(lower) > high) return failure("repeat range is out of order");
  return { index: close + 1 };
};

const parseAtom = (pattern: string, index: number, parseGroup: (index: number) => Parsed<Step>): Parsed<Atom> => {
  const char = pattern[index] ?? "";
  const plain = (next: number): Atom => ({ index: next, quantified: false, anchor: false, group: false });
  if (char === "^" || char === "$") return { ...plain(index + 1), anchor: true };
  if (char === ".") return plain(index + 1);
  if (char === "\\") {
    const escape = parseEscape(pattern, index);
    return failed(escape) ? escape : plain(escape.index);
  }
  if (char === "[") {
    const cls = parseClass(pattern, index);
    return failed(cls) ? cls : plain(cls.index);
  }
  if (char === "(") {
    const group = parseGroup(index);
    return failed(group) ? group : { ...group, anchor: false, group: true };
  }
  if (QUANTIFIER_START.test(char)) return failure("a quantifier has nothing to repeat");
  return plain(index + 1);
};

const parseSequence = (
  pattern: string,
  index: number,
  quantified: boolean,
  parseGroup: (index: number) => Parsed<Step>,
): Parsed<Step> => {
  const char = pattern[index];
  if (char === undefined || char === "|" || char === ")") return { index, quantified };
  const atom = parseAtom(pattern, index, parseGroup);
  if (failed(atom)) return atom;
  const quantifier = parseQuantifier(pattern, atom.index);
  if (quantifier === undefined) return parseSequence(pattern, atom.index, quantified || atom.quantified, parseGroup);
  if (failed(quantifier)) return quantifier;
  if (atom.anchor) return failure("a quantifier cannot follow an anchor");
  if (atom.group && atom.quantified) return failure("nested quantifier: a repeated group cannot itself contain a quantifier");
  const next = pattern[quantifier.index];
  if (next !== undefined && QUANTIFIER_START.test(next))
    return failure("stacked quantifiers (including lazy and possessive forms) are not supported");
  return parseSequence(pattern, quantifier.index, true, parseGroup);
};

const parseAlternation = (pattern: string, index: number, quantified: boolean): Parsed<Step> => {
  const parseGroup = (at: number): Parsed<Step> => parseGroupAt(pattern, at);
  const branch = parseSequence(pattern, index, false, parseGroup);
  if (failed(branch)) return branch;
  const merged = quantified || branch.quantified;
  return pattern[branch.index] === "|" ? parseAlternation(pattern, branch.index + 1, merged) : { index: branch.index, quantified: merged };
};

const parseGroupAt = (pattern: string, index: number): Parsed<Step> => {
  const marked = pattern[index + 1] === "?";
  if (marked && pattern[index + 2] !== ":") return failure("only (?: groups are supported; lookaround, named groups and flags are not");
  const inner = parseAlternation(pattern, index + (marked ? 3 : 1), false);
  if (failed(inner)) return inner;
  return pattern[inner.index] === ")" ? { index: inner.index + 1, quantified: inner.quantified } : failure("unclosed group");
};

const checkLength = (pattern: string): Failure | undefined => {
  if (pattern === "") return failure("pattern is empty");
  if (pattern.length > EVENT_PATTERN_MAX_LENGTH) return failure(`pattern must be at most ${EVENT_PATTERN_MAX_LENGTH} characters`);
  return PRINTABLE_ASCII_WITHOUT_SPACE.test(pattern) ? undefined : failure("only printable ASCII characters without spaces are supported");
};

export const checkEventPattern = (pattern: string): PatternCheck => {
  const refused = checkLength(pattern);
  if (refused !== undefined) return { valid: false, reason: refused.error };
  const parsed = parseAlternation(pattern, 0, false);
  if (failed(parsed)) return { valid: false, reason: parsed.error };
  return parsed.index === pattern.length ? { valid: true } : { valid: false, reason: "unmatched closing parenthesis" };
};

export const isValidEventPattern = (pattern: string): boolean => checkEventPattern(pattern).valid;
