/**
 * The translated server-error table is the one dictionary TypeScript does not police.
 *
 * `dict` is `Record<Lang, Record<StringKey, string>>`, so a missing UI string fails the build. `API_ERRORS` is
 * `Record<Lang, Record<string, string>>` — the codes are open-ended, which is what lets a language quietly fall
 * behind and answer in raw English. These tests are the parity check the type system cannot give us.
 */
import { API_ERRORS, LANGS } from "./index";

const CODES = Object.keys(API_ERRORS.it).sort();
const LANG_CODES = LANGS.map((l) => l.code);

/** What a stranger hits before they have an account: the screens a store reviewer sees first. */
const PRE_ACCOUNT_CODES = [
  "INVALID_CREDENTIALS",
  "EMAIL_ALREADY_REGISTERED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_REQUIRED",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "WORLD_FULL",
  "HOUSE_NAME_TAKEN",
];

it("covers every language the app offers", () => {
  expect(Object.keys(API_ERRORS).sort()).toEqual([...LANG_CODES].sort());
});

it.each(LANG_CODES)("says the same set of codes in %s as in Italian", (lang) => {
  expect(Object.keys(API_ERRORS[lang]).sort()).toEqual(CODES);
});

it.each(LANG_CODES)("explains the pre-account failures in %s", (lang) => {
  // Collected rather than asserted one by one: the failure then names every gap at once.
  const unexplained = PRE_ACCOUNT_CODES.filter((c) => !API_ERRORS[lang][c] || API_ERRORS[lang][c] === c);
  expect(unexplained).toEqual([]);
});

it.each(LANG_CODES)("has no blank wording in %s", (lang) => {
  const blank = Object.entries(API_ERRORS[lang])
    .filter(([, message]) => message.trim() === "")
    .map(([code]) => code);
  expect(blank).toEqual([]);
});
