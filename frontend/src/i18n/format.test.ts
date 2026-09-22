/**
 * Duration and number formatting, per language.
 *
 * Both used to be hardwired to Italian units and an it-IT locale, so a player on any other language read timers and
 * costs in the wrong one. Nothing in a typecheck notices that, and nothing in the UI looks broken either — a Russian
 * player seeing "2g 5h" just reads a number with a letter after it.
 */
import { LANGS, formatDuration, formatNumber, setFormatterLanguage } from "./index";

afterEach(() => setFormatterLanguage("it"));

describe("formatDuration", () => {
  it("shows days and hours once a day is on the clock, and drops the smaller units", () => {
    expect(formatDuration(2 * 86400 + 5 * 3600 + 42 * 60)).toBe("2g 5h");
  });

  it("shows hours and zero-padded minutes below a day", () => {
    expect(formatDuration(5 * 3600 + 7 * 60)).toBe("5h 07m");
  });

  it("counts down in minutes and seconds in the last hour, which is when it is being watched", () => {
    expect(formatDuration(9 * 60 + 5)).toBe("09:05");
    expect(formatDuration(59)).toBe("00:59");
  });

  it("treats a deadline already past as zero rather than counting upwards", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(-500)).toBe("00:00");
  });

  it("uses each language's own unit letters", () => {
    const seconds = 2 * 86400 + 5 * 3600;
    setFormatterLanguage("en");
    expect(formatDuration(seconds)).toBe("2d 5h");
    setFormatterLanguage("fr");
    expect(formatDuration(seconds)).toBe("2j 5h");
    setFormatterLanguage("de");
    expect(formatDuration(seconds)).toBe("2T 5h");
    setFormatterLanguage("ru")
    expect(formatDuration(seconds)).toBe("2д 5ч");
    setFormatterLanguage("zh");
    expect(formatDuration(seconds)).toBe("2天 5时");
  });

  it("has units for every language the game offers", () => {
    for (const { code } of LANGS) {
      setFormatterLanguage(code);
      expect(formatDuration(86400 + 3600)).not.toContain("undefined");
    }
  });
});

/**
 * The thresholds and suffixes are ours and are asserted exactly. Group and decimal separators come from the
 * engine's ICU data, which differs between Node and Hermes, so those are checked by delegation: the assertion is
 * that the number goes through the right locale, not that a particular glyph comes out.
 */
describe("formatNumber", () => {
  const localeOf = (code: string) => LANGS.find((l) => l.code === code)!.locale;

  it("leaves numbers under ten thousand whole, because a resource cost is read exactly", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(9999)).toBe((9999).toLocaleString(localeOf("it")));
    expect(formatNumber(9999)).not.toContain("k");
  });

  it("abbreviates from five figures up, and drops the decimal once the number is big enough", () => {
    expect(formatNumber(10_000)).toBe(`${(10).toLocaleString(localeOf("it"))}k`);
    expect(formatNumber(12_500)).toBe(`${(12.5).toLocaleString(localeOf("it"))}k`);
    expect(formatNumber(125_000)).toBe(`${(125).toLocaleString(localeOf("it"))}k`);
    expect(formatNumber(1_500_000)).toBe(`${(1.5).toLocaleString(localeOf("it"))}M`);
    expect(formatNumber(12_000_000)).toBe(`${(12).toLocaleString(localeOf("it"))}M`);
  });

  it("truncates rather than rounding up, so a cost never reads as affordable when it is not", () => {
    expect(formatNumber(1999.9)).toBe((1999).toLocaleString(localeOf("it")));
  });

  it("formats through each language's own locale", () => {
    for (const { code, locale } of LANGS) {
      setFormatterLanguage(code);
      expect(formatNumber(9876)).toBe((9876).toLocaleString(locale));
      expect(formatNumber(12_500)).toBe(`${(12.5).toLocaleString(locale)}k`);
    }
  });

  it("really does differ between languages, or delegating proves nothing", () => {
    setFormatterLanguage("it");
    const italian = formatNumber(98_765);
    setFormatterLanguage("en");
    expect(formatNumber(98_765)).not.toBe(italian);
  });
});
