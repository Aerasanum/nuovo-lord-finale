"""What a push says on a locked phone.

The wording has to live on the server: the notification is drawn by the operating system while the app is dead, so
there is no client to translate it. Only the titles are translated — a body is built from the parts of the payload
that read the same in every language (a sector, a settlement name, a date), because a half-translated line
("Diplomazia · WAR_DECLARED") is worse than a short one.

Languages are the eight the app ships (frontend/src/i18n); anything else falls back to English.
"""
from __future__ import annotations

LANGS = ("it", "en", "es", "fr", "de", "pt", "ru", "zh")
FALLBACK_LANG = "en"

# Keys are the push title, not the event: OWNERSHIP_CHANGED only pushes when a settlement is lost, so it reads as a
# loss rather than as the neutral "ownership changed" the inbox shows.
TITLES: dict[str, dict[str, str]] = {
    "SENTINEL_ATTACKED": {
        "it": "Sentinella sotto attacco",
        "en": "Sentinel under attack",
        "es": "Centinela bajo ataque",
        "fr": "Sentinelle attaquée",
        "de": "Wachturm angegriffen",
        "pt": "Sentinela sob ataque",
        "ru": "Сентинел под атакой",
        "zh": "哨塔遭受攻击",
    },
    "SENTINEL_LOST": {
        "it": "Sentinella perduta",
        "en": "Sentinel lost",
        "es": "Centinela perdido",
        "fr": "Sentinelle perdue",
        "de": "Wachturm verloren",
        "pt": "Sentinela perdida",
        "ru": "Сентинел потерян",
        "zh": "哨塔已失守",
    },
    "SHARED_BORDER_ENDED": {
        "it": "Confine condiviso terminato",
        "en": "Shared border ended",
        "es": "Frontera compartida terminada",
        "fr": "Frontière partagée terminée",
        "de": "Gemeinsame Grenze beendet",
        "pt": "Fronteira partilhada terminada",
        "ru": "Общая граница упразднена",
        "zh": "共享边界已结束",
    },
    "NAVAL_FLEET_DETECTED": {
        "it": "Flotta nemica avvistata",
        "en": "Enemy fleet sighted",
        "es": "Flota enemiga avistada",
        "fr": "Flotte ennemie repérée",
        "de": "Feindliche Flotte gesichtet",
        "pt": "Frota inimiga avistada",
        "ru": "Замечен вражеский флот",
        "zh": "发现敌方舰队",
    },
    "SETTLEMENT_CONQUERED": {
        "it": "Insediamento conquistato",
        "en": "Settlement conquered",
        "es": "Asentamiento conquistado",
        "fr": "Colonie conquise",
        "de": "Siedlung erobert",
        "pt": "Povoado conquistado",
        "ru": "Поселение захвачено",
        "zh": "聚落已被占领",
    },
    "SETTLEMENT_LOST": {
        "it": "Insediamento perduto",
        "en": "Settlement lost",
        "es": "Asentamiento perdido",
        "fr": "Colonie perdue",
        "de": "Siedlung verloren",
        "pt": "Povoado perdido",
        "ru": "Поселение потеряно",
        "zh": "聚落已失守",
    },
    "DIPLOMACY_STATE_CHANGED": {
        "it": "Diplomazia cambiata",
        "en": "Diplomacy changed",
        "es": "La diplomacia ha cambiado",
        "fr": "Diplomatie modifiée",
        "de": "Diplomatie geändert",
        "pt": "Diplomacia alterada",
        "ru": "Дипломатия изменилась",
        "zh": "外交关系已变更",
    },
    "MERCENARY_CONTRACT_ACTIVE": {
        "it": "Contratto mercenario attivo",
        "en": "Mercenary contract active",
        "es": "Contrato mercenario activo",
        "fr": "Contrat mercenaire actif",
        "de": "Söldnervertrag aktiv",
        "pt": "Contrato de mercenários ativo",
        "ru": "Контракт наёмника активен",
        "zh": "雇佣兵契约生效",
    },
    "HOSTILE_MARCH_DETECTED": {
        "it": "Marcia ostile avvistata",
        "en": "Hostile march sighted",
        "es": "Marcha hostil avistada",
        "fr": "Marche hostile repérée",
        "de": "Feindlicher Marsch gesichtet",
        "pt": "Marcha hostil detetada",
        "ru": "Замечен вражеский марш",
        "zh": "发现敌对行军",
    },
    "PYRAMID_ATTACK_INCOMING": {
        "it": "Piramide sotto attacco",
        "en": "Pyramid under attack",
        "es": "Pirámide bajo ataque",
        "fr": "Pyramide sous attaque",
        "de": "Pyramide unter Angriff",
        "pt": "Pirâmide sob ataque",
        "ru": "Пирамида под атакой",
        "zh": "金字塔遭受攻击",
    },
    "INACTIVITY_WARNING": {
        "it": "Il tuo Regno è a rischio",
        "en": "Your realm is at risk",
        "es": "Tu reino está en riesgo",
        "fr": "Votre royaume est en danger",
        "de": "Dein Reich ist in Gefahr",
        "pt": "O teu reino está em risco",
        "ru": "Ваше королевство под угрозой",
        "zh": "你的王国面临风险",
    },
}


def title_key(event: str, payload: dict) -> str:
    """The TITLES key for an event. OWNERSHIP_CHANGED is the emitted name of the catalog's SETTLEMENT_CONQUERED."""
    if event == "OWNERSHIP_CHANGED":
        return "SETTLEMENT_LOST" if payload.get("lost") else "SETTLEMENT_CONQUERED"
    return event


def title(event: str, payload: dict, lang: str) -> str:
    by_lang = TITLES.get(title_key(event, payload), {})
    return by_lang.get(lang) or by_lang.get(FALLBACK_LANG) or event.replace("_", " ").title()


def detail(event: str, payload: dict) -> str:
    """Language-neutral specifics: a sector, a name, a pair of coordinates, a date. Empty when there are none."""
    p = payload or {}
    if event in {"SENTINEL_ATTACKED", "SENTINEL_LOST", "NAVAL_FLEET_DETECTED"}:
        return str(p.get("sector") or "")
    if event == "SHARED_BORDER_ENDED":
        sectors = p.get("sectors") or []
        return ", ".join(str(s) for s in sectors) if isinstance(sectors, list) else str(sectors)
    if event in {"SETTLEMENT_CONQUERED", "OWNERSHIP_CHANGED"}:
        name = p.get("settlement_name") or p.get("target_name")
        if name:
            return str(name)
        return f"{p['x']},{p['y']}" if p.get("x") is not None and p.get("y") is not None else ""
    if event == "DIPLOMACY_STATE_CHANGED":
        tag, name = p.get("other_tag"), p.get("other_name") or p.get("alliance_name")
        return f"[{tag}] {name}" if tag and name else str(name or "")
    if event == "MERCENARY_CONTRACT_ACTIVE":
        return str(p.get("target_name") or "")
    if event == "HOSTILE_MARCH_DETECTED":
        return str(p.get("target_name") or "")
    if event == "PYRAMID_ATTACK_INCOMING":
        tag = p.get("attacker_alliance_tag")
        return f"[{tag}]" if tag else ""
    if event == "INACTIVITY_WARNING":
        at = str(p.get("eliminate_at") or "")
        return at[:10]  # the ISO date; an hour would be wrong without the player's timezone
    return ""


def body(event: str, payload: dict, world_name: str) -> str:
    """The realm first — a player in two realms needs to know which one woke them — then the specifics."""
    bits = [world_name.strip(), detail(event, payload).strip()]
    return " · ".join(b for b in bits if b)
