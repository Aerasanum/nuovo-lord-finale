"""One-off / repeatable UI localisation: translate the Italian dictionary of frontend/src/i18n/index.tsx (plus API error
texts and resource labels) into the Grande Mondo languages with the Emergent LLM key, writing
frontend/src/i18n/locales/<lang>.ts. Resumable (JSON cache per language under scripts/i18n_cache/).

    cd /app/backend && python scripts/translate_i18n.py [--langs fr,es,de,ru,zh,pt] [--batch 60] [--only-missing]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

I18N = ROOT / "frontend" / "src" / "i18n" / "index.tsx"
OUT_DIR = ROOT / "frontend" / "src" / "i18n" / "locales"
CACHE_DIR = Path(__file__).resolve().parent / "i18n_cache"
PAIR = re.compile(r'^  ([A-Za-z0-9_]+): "((?:[^"\\]|\\.)*)",?\s*(?://.*)?$', re.M)
PLACEHOLDER = re.compile(r"\{(\w+)\}")

LANGS = {
    "fr": "French (France)",
    "es": "Spanish (Spain)",
    "de": "German (Germany/Austria)",
    "ru": "Russian",
    "zh": "Simplified Chinese (zh-CN)",
    "pt": "European Portuguese (Portugal)",
}

SYSTEM = (
    "You are a senior game localiser for a medieval-fantasy mobile strategy MMO ('Empire Lords Dragon': castles, armies, "
    "Dragon, Pyramid, alliances, caravans, Rubies premium currency). Translate UI strings from Italian (source of truth) into "
    "the requested language; the English version is given only as a reference for meaning. Rules: keep every {placeholder} "
    "token EXACTLY as is (same name, same braces); keep line breaks (\\n) and punctuation style; keep strings short "
    "(mobile UI, same length class as the Italian); use the natural, consistent gaming terminology of the target language "
    "(e.g. 'marcia'→march term, 'Casata'→House/noble house term, 'Sentinella'→sentinel tower); keep the proper name 'Empire "
    "Lords Dragon' untranslated; keep unit/building names that appear in Italian inside quotes «…» untranslated. Answer with "
    "a single JSON object mapping each key to its translation — no commentary, no markdown."
)


def _block(src: str, start_marker: str) -> dict[str, str]:
    i0 = src.index(start_marker)
    i1 = src.index("\n};", i0)
    return {k: v for k, v in PAIR.findall(src[i0:i1])}


def _errors_block(src: str, lang: str) -> dict[str, str]:
    a = src.index("export const API_ERRORS")
    i0 = src.index(f"\n  {lang}: {{", a)
    i1 = src.index("\n  },", i0)
    return {m.group(1): m.group(2) for m in re.finditer(r'^    ([A-Za-z0-9_]+): "((?:[^"\\]|\\.)*)",?\s*$', src[i0:i1], re.M)}


def _resources_block(src: str, lang: str) -> dict[str, str]:
    a = src.index("export const RESOURCE_LABELS")
    m = re.search(rf"^  {lang}: \{{(.*)\}},?$", src[a:], re.M)
    return {k: v for k, v in re.findall(r'(\w+): "((?:[^"\\]|\\.)*)"', m.group(1))}


def load_sources() -> tuple[dict, dict, dict, dict, dict, dict]:
    src = I18N.read_text(encoding="utf-8")
    it = _block(src, "const it = {")
    en = _block(src, "const en: typeof it = {")
    return it, en, _errors_block(src, "it"), _errors_block(src, "en"), _resources_block(src, "it"), _resources_block(src, "en")


def unescape(v: str) -> str:
    return v.replace('\\"', '"').replace("\\n", "\n")


def escape(v: str) -> str:
    return v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


async def translate_batch(lang: str, items: dict[str, tuple[str, str]], model: str) -> dict[str, str]:
    key = os.environ["EMERGENT_LLM_KEY"]
    chat = LlmChat(api_key=key, session_id=f"i18n-{lang}-{abs(hash(tuple(items)))}", system_message=SYSTEM).with_model("openai", model)
    payload = {k: {"it": unescape(it), "en": unescape(en)} for k, (it, en) in items.items()}
    prompt = f"Target language: {LANGS[lang]}.\nTranslate the 'it' value of every key. Return JSON {{key: translation}} with exactly these {len(items)} keys.\n\n{json.dumps(payload, ensure_ascii=False)}"
    text = await chat.send_message(UserMessage(text=prompt))
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{") :]
    text = text[text.find("{") : text.rfind("}") + 1]
    out = json.loads(text)
    return {k: str(v) for k, v in out.items() if k in items}


def validate(src: str, dst: str) -> bool:
    return set(PLACEHOLDER.findall(unescape(src))) == set(PLACEHOLDER.findall(dst)) and dst.strip() != ""


async def run(langs: list[str], batch: int, model: str, only_missing: bool) -> None:
    it, en, err_it, err_en, res_it, res_en = load_sources()
    all_items = {**{k: (it[k], en.get(k, it[k])) for k in it}, **{f"__err__{k}": (v, err_en.get(k, v)) for k, v in err_it.items()}, **{f"__res__{k}": (v, res_en.get(k, v)) for k, v in res_it.items()}}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for lang in langs:
        cache_file = CACHE_DIR / f"{lang}.json"
        cache: dict[str, str] = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
        def stale(k: str) -> bool:
            # a "translation" identical to the Italian source (while English differs) is a miss by the model → redo it
            src, en_v = all_items[k]
            return cache.get(k) == unescape(src) and unescape(src) != unescape(en_v) and len(src) > 3
        todo = [k for k in all_items if k not in cache or stale(k)] if only_missing or cache else list(all_items)
        print(f"[{lang}] {len(todo)} strings to translate ({len(cache)} cached)", flush=True)
        for i in range(0, len(todo), batch):
            keys = todo[i : i + batch]
            items = {k: all_items[k] for k in keys}
            for attempt in range(3):
                try:
                    out = await translate_batch(lang, items, model)
                    missing = [k for k in keys if k not in out or not validate(all_items[k][0], out[k])]
                    for k in keys:
                        if k not in missing:
                            cache[k] = out[k]
                    if missing:
                        print(f"[{lang}] batch {i // batch}: {len(missing)} invalid → retry", flush=True)
                        items = {k: all_items[k] for k in missing}
                        keys = missing
                        continue
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"[{lang}] batch {i // batch} attempt {attempt}: {e}", flush=True)
                    await asyncio.sleep(2)
            cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
            print(f"[{lang}] {min(i + batch, len(todo))}/{len(todo)}", flush=True)
        write_locale(lang, it, err_it, res_it, cache, en, err_en, res_en)


def write_locale(lang: str, it: dict, err_it: dict, res_it: dict, cache: dict, en: dict, err_en: dict, res_en: dict) -> None:
    def line(k: str, v: str, indent: str = "  ") -> str:
        return f'{indent}{k}: "{escape(v)}",'

    main = [line(k, cache.get(k) or unescape(en.get(k, v))) for k, v in it.items()]
    errs = [line(k, cache.get(f"__err__{k}") or unescape(err_en.get(k, v)), "  ") for k, v in err_it.items()]
    ress = [line(k, cache.get(f"__res__{k}") or unescape(res_en.get(k, v)), "  ") for k, v in res_it.items()]
    missing = sum(1 for k in it if k not in cache)
    body = (
        f"// Generated by backend/scripts/translate_i18n.py — {LANGS[lang]} ({missing} strings fell back to English). Edit freely; re-running keeps cached translations.\n"
        f"import type {{ StringKey }} from \"../index\";\n\n"
        f"export const {lang}: Record<StringKey, string> = {{\n" + "\n".join(main) + "\n};\n\n"
        f"export const {lang}Errors: Record<string, string> = {{\n" + "\n".join(errs) + "\n};\n\n"
        f"export const {lang}Resources: Record<string, string> = {{\n" + "\n".join(ress) + "\n};\n"
    )
    (OUT_DIR / f"{lang}.ts").write_text(body, encoding="utf-8")
    print(f"[{lang}] wrote {OUT_DIR / f'{lang}.ts'} ({len(main)} keys, {missing} fallbacks)", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(LANGS))
    ap.add_argument("--batch", type=int, default=60)
    ap.add_argument("--model", default="gpt-5.4-mini")
    ap.add_argument("--only-missing", action="store_true")
    a = ap.parse_args()
    asyncio.run(run([x.strip() for x in a.langs.split(",") if x.strip()], a.batch, a.model, a.only_missing))
