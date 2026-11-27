import { describe, expect, it } from "vitest";

import { checkEventPattern, EVENT_PATTERN_MAX_LENGTH } from "./event-pattern";

const reasonFor = (pattern: string): string => {
  const result = checkEventPattern(pattern);
  return result.valid ? "" : result.reason;
};

describe("checkEventPattern accepts the safe subset", () => {
  it.each([
    "signup_completed",
    "signup_.*",
    "^(signup|register)_completed$",
    "(?:signup|register)_[a-z]+",
    "step_[0-9]{1,3}",
    "step\\d{2}",
    "sign\\.up",
    "[^_]+_done",
    "a?b+c*",
    "(a|b)+",
    "(ab)?c",
  ])("accepts %s", (pattern) => expect(checkEventPattern(pattern)).toEqual({ valid: true }));
});

describe("checkEventPattern rejects what could backtrack or hide a bypass", () => {
  it.each([
    ["a backreference", "(a)\\1", /backreference/i],
    ["a named backreference", "(a)\\k<x>", /escape/i],
    ["a lookahead", "a(?=b)", /\(\?:/],
    ["a negative lookahead", "a(?!b)", /\(\?:/],
    ["a lookbehind", "(?<=a)b", /\(\?:/],
    ["a named group", "(?P<x>a)", /\(\?:/],
    ["an inline flag", "(?i)signup", /\(\?:/],
    ["a nested quantifier", "(a+)+", /nested/i],
    ["a nested star", "(a*)*", /nested/i],
    ["a nested counted repeat", "(a+){2}", /nested/i],
    ["a counted repeat of a counted repeat", "(a{2}){3}", /nested/i],
    ["a quantifier nested two levels down", "((a+)b)*", /nested/i],
    ["stacked quantifiers", "a**", /stacked/i],
    ["a lazy quantifier", "a+?", /stacked/i],
    ["a possessive quantifier", "a++", /stacked/i],
    ["an unbounded counted repeat", "a{2,}", /unbounded/i],
    ["a counted repeat above the cap", "a{1,21}", /at most/i],
    ["a counted repeat that runs backwards", "a{3,2}", /order/i],
    ["a quantifier with nothing to repeat", "*a", /nothing to repeat/i],
    ["a quantifier on an anchor", "^*a", /anchor/i],
    ["an unclosed group", "(abc", /unclosed/i],
    ["an unmatched closing paren", "abc)", /unmatched/i],
    ["a closing paren that escapes the wrapper", "a)|(.*", /unmatched/i],
    ["an unterminated class", "[abc", /class/i],
    ["an empty class", "[]", /class/i],
    ["a posix class", "[[:alpha:]]", /class/i],
    ["an unsupported escape", "\\p{L}", /escape/i],
    ["an escaped letter that is not a class", "\\bfoo", /escape/i],
    ["a lone brace", "a{", /quantifier/i],
    ["an empty pattern", "", /empty/i],
    ["a non-ascii character", "café", /ascii/i],
    ["a space", "sign up", /ascii/i],
    ["a pattern longer than the cap", "a".repeat(EVENT_PATTERN_MAX_LENGTH + 1), /at most/i],
  ])("rejects %s", (_label, pattern, expected) => expect(reasonFor(pattern)).toMatch(expected));

  it("accepts a pattern exactly at the cap", () =>
    expect(checkEventPattern("a".repeat(EVENT_PATTERN_MAX_LENGTH))).toEqual({ valid: true }));
});
