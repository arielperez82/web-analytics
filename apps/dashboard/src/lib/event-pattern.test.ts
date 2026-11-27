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
    "a{20}",
    "a{1,20}",
    "a{0,1}",
    "\\D\\W\\S",
    "a\\/b\\:c",
    "[\\d]",
    "[\\d_-]",
    "[-a]",
    "[a-]",
    "[a-c]x",
    "^a|b$",
    "a$",
    "^a",
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
    ["a counted repeat of exactly the cap plus one", "a{21}", /at most/i],
    ["a counted repeat with a three digit count", "a{1000}", /at most/i],
    ["a nested quantifier through alternation", "(a|b+)+", /nested/i],
    ["a nested quantifier in a non-capturing group", "(?:a+)+", /nested/i],
    ["a nested star in a non-capturing group", "(?:a+)*", /nested/i],
    ["a quantified group with a quantifier in one branch", "(?:a|b*c)?", /nested/i],
    ["a repeat with no lower bound", "a{,5}", /quantifier/i],
    ["a repeat with three numbers", "a{1,2,3}", /quantifier/i],
    ["a repeat with a letter bound", "a{1,x}", /quantifier/i],
    ["a null escape", "a\\0", /backreference/i],
    ["a trailing backslash", "abc\\", /backslash/i],
    ["a backreference inside a class", "[\\1]", /backreference/i],
    ["a quantified end anchor", "a$+", /anchor/i],
    ["a quantified start anchor", "^{2}a", /anchor/i],
    ["a delete character", "a\u007fb", /ascii/i],
    ["a newline", "a\nb", /ascii/i],
    ["a tab", "a\tb", /ascii/i],
    ["a backwards class range", "[z-a]", /range/i],
    ["a class range that starts at a class escape", "[\\w-z]", /range/i],
    ["a class range that ends at a class escape", "[a-\\d]", /range/i],
    ["a class range that follows a range", "[a-c-e]", /range/i],
    ["a non-ascii character", "café", /ascii/i],
    ["a space", "sign up", /ascii/i],
    ["a pattern longer than the cap", "a".repeat(EVENT_PATTERN_MAX_LENGTH + 1), /at most/i],
  ])("rejects %s", (_label, pattern, expected) => expect(reasonFor(pattern)).toMatch(expected));

  it("accepts a pattern exactly at the cap", () =>
    expect(checkEventPattern("a".repeat(EVENT_PATTERN_MAX_LENGTH))).toEqual({ valid: true }));
});
