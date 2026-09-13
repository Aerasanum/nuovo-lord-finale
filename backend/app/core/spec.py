"""Canonical Spec loader — the single numeric runtime authority (spec_contract).

Loads 02_EMPIRE_LORDS_DRAGON_CANONICAL_SPEC_v3.7_ANDROID_ONLY.json, verifies spec_hash with the
canonical algorithm, and exposes typed accessors. Nothing numeric is hard-coded elsewhere.
"""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal
from functools import lru_cache
from typing import Any

from app.core import config

_DUR_RE = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*(min|h|gg)\s*$")


def parse_duration_minutes(text: str) -> int:
    """Literal conversion of the JSON display strings ('15 min', '1,4 h', '1,3 gg') to integer minutes.
    Uses Decimal so 1,4 h == 84 exactly. Values in the spec are all whole minutes."""
    m = _DUR_RE.match(text)
    if not m:
        raise ValueError(f"Unparseable duration: {text!r}")
    qty = Decimal(m.group(1).replace(",", "."))
    unit = m.group(2)
    mult = {"min": Decimal(1), "h": Decimal(60), "gg": Decimal(1440)}[unit]
    minutes = qty * mult
    if minutes != minutes.to_integral_value():
        # Report instead of silently rounding — display string does not map to whole minutes.
        raise ValueError(f"Duration {text!r} is not a whole number of minutes: {minutes}")
    return int(minutes)


def compute_spec_hash(doc: dict) -> str:
    clone = json.loads(json.dumps(doc))
    clone.get("spec_contract", {}).pop("spec_hash", None)
    s = json.dumps(clone, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


class Spec:
    def __init__(self, raw: dict):
        self.raw = raw
        self.version: str = raw["document"]["version"]
        self.declared_hash: str = raw["spec_contract"]["spec_hash"]
        self.computed_hash: str = compute_spec_hash(raw)
        if self.declared_hash != self.computed_hash:
            raise RuntimeError(
                f"BLOCKED_SPEC_DIVERGENCE spec_contract.spec_hash declared={self.declared_hash} computed={self.computed_hash}"
            )
        if config.SPEC_EXPECTED_HASH and config.SPEC_EXPECTED_HASH != self.computed_hash:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE expected hash mismatch")

        # ----- world / terrain -----
        self.world = raw["world"]
        self.terrain = raw["terrain"]
        self.regions = raw["regions"]
        self.spawn = raw["spawn"]
        self.generator = raw["generator"]
        self.player_bootstrap = raw["player_bootstrap"]
        self.pvp_shield = raw["pvp_shield"]
        self.architecture = raw["architecture"]
        self.map_lod = raw["map_lod"]

        # ----- economy -----
        self.economy = {row["level"]: row for row in raw["economy"]}
        self.warehouse_policy = raw["warehouse_policy"]
        self.resource_overflow = raw["resource_overflow"]
        self.resources = ["grain", "wood", "clay", "iron", "gold"]

        # ----- buildings -----
        self.buildings = raw["buildings"]
        self.buildings_by_name = {b["name"]: b for b in self.buildings}
        self.building_order = [b["name"] for b in self.buildings]
        self.building_upgrade_costs = {
            (r["building"], r["target_level"]): r for r in raw["building_upgrade_costs"]
        }
        self.construction_curve = raw["construction_curve"]
        self.construction_runtime = raw["construction_runtime"]
        self.early_game_fast = raw["early_game_fast"]
        self.building_unlock_policy = raw["building_unlock_policy"]
        self.unlock_registry = raw["unlock_registry"]
        self.settlement_progression = {r["level"]: r for r in raw["settlement_progression"]}
        self.cancellation_policy = raw["cancellation_policy"]

        # ----- research -----
        self.research_nodes = raw["research_nodes"]
        self.research_by_key = {n["key"]: n for n in self.research_nodes}
        self.research_branches = sorted({n["branch"] for n in self.research_nodes})
        self.research_costs = {(r["class"], r["level"]): r for r in raw["research_costs"]}
        self.research_effects = {e["research_key"]: e for e in raw["research_effects"]}
        self.research_scope = raw["research_scope"]
        self.research_count = raw["research_count"]

        # ----- units / combat -----
        self.units = raw["units"]
        self.units_by_name = {u["name"]: u for u in self.units}
        self.unit_order = [u["name"] for u in self.units]
        self.unit_costs = {u["name"]: u for u in raw["unit_costs"]}
        self.walls = {w["level"]: w for w in raw["walls"]}
        self.counter_matrix = raw["counter_matrix"]
        self.combat_resolution = raw["combat_resolution"]
        self.unit_special_abilities = raw["unit_special_abilities"]
        self.modifier_algebra = raw["modifier_algebra"]
        self.recruitment = raw["recruitment"]
        self.marches = raw["marches"]
        self.pathfinding_rules = raw["pathfinding_rules"]
        self.territory = raw["territory"]
        self.sentinel_runtime = raw["sentinel_runtime"]
        self.navigation = raw["navigation"]
        self.naval_surveillance = raw["naval_surveillance"]
        self.conquest = raw["conquest"]
        self.retention = raw["retention"]
        self.neutral_runtime = raw["neutral_runtime"]
        self.neutral_conversion = raw["neutral_conversion"]
        self.raid = raw["raid"]
        self.event_ordering = raw["event_ordering"]
        self.notification_event_catalog = raw["notification_event_catalog"]
        self.wall_repair = raw["wall_repair"]
        self.development_score = raw["development_score"]
        # progression systems (Bible §20 / §22 / §39)
        self.missions = raw["missions"]
        self.achievements = raw["achievements"]
        self.house = raw["house"]
        self.caravans = raw["caravans"]
        self.premium = raw["premium"]
        self.alliance_policy = raw["alliance_policy"]
        self.emeralds = raw["emeralds"]
        self.diplomacy = raw["diplomacy"]
        self.mercenary_contract = raw["mercenary_contract"]
        self.pyramid = raw["pyramid"]
        self.player_specialization = raw["player_specialization"]
        self.inactivity_transition = raw["inactivity_transition"]
        self.legendary_stacking = raw["legendary_stacking"]
        self.mother_transition = raw["mother_transition"]
        self.mythic = raw["mythic"]

        self._validate_counts()

    # ------------------------------------------------------------------ validation
    def _validate_counts(self) -> None:
        if len(self.buildings) != 21:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE buildings count != 21")
        if len(self.research_nodes) != 114 or self.research_count != 114:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE research count != 114")
        if len(self.research_by_key) != 114:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE duplicate research keys")
        if len(self.research_branches) != 12:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE research branches != 12")
        if len(self.units) != 13:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE units != 13")
        if len(self.building_upgrade_costs) != 600:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE building_upgrade_costs rows != 600")
        if len(self.economy) != 30 or len(self.walls) != 30 or len(self.settlement_progression) != 30:
            raise RuntimeError("BLOCKED_SPEC_DIVERGENCE 30-level tables incomplete")
        for key in self.research_by_key:
            if key not in self.research_effects:
                raise RuntimeError(f"BLOCKED_SPEC_DIVERGENCE research_effects missing {key}")
        # castle rows must match settlement_progression (both canonical)
        for lvl in range(2, 31):
            row = self.building_upgrade_costs[("Castello / Fortezza", lvl)]
            prog = self.settlement_progression[lvl]
            if row["base_cost"] != prog["upgrade_cost"] or row["base_time_min"] != prog["upgrade_time_min"]:
                raise RuntimeError(f"BLOCKED_SPEC_DIVERGENCE castle vs settlement_progression level {lvl}")

    # ------------------------------------------------------------------ accessors
    def research_prereqs(self, key: str) -> list[str]:
        raw = self.research_by_key[key]["prerequisites"]
        if not raw or raw.strip() == "-":
            return []
        return [p.strip() for p in raw.split("+") if p.strip()]

    def research_cost(self, cost_class: str, level: int) -> tuple[dict[str, int], int]:
        row = self.research_costs[(cost_class, level)]
        cost = {r: int(row[r]) for r in self.resources}
        return cost, parse_duration_minutes(row["time"])

    def unit_base_time_seconds(self, unit: str) -> int:
        return parse_duration_minutes(self.unit_costs[unit]["base_time"]) * 60

    def unit_cost(self, unit: str) -> dict[str, int]:
        row = self.unit_costs[unit]
        return {r: int(row[r]) for r in self.resources}

    def building_cost_time(self, building: str, target_level: int) -> tuple[dict[str, int], int]:
        row = self.building_upgrade_costs.get((building, target_level))
        if row is None:
            raise KeyError(f"No canonical row for {building} L{target_level}")
        return {r: int(row["base_cost"][r]) for r in self.resources}, int(row["base_time_min"])

    def terrain_code(self, name: str) -> int:
        return {"plain": 0, "forest": 1, "mountain": 2, "water": 3}[name]

    def terrain_name(self, code: int) -> str:
        return ["plain", "forest", "mountain", "water"][code]

    # Settlement-progression requirement tokens (e.g. "Prod3, Mag3, Uni3, Mura3, Cas3, Sent1").
    REQ_TOKEN_MAP = {
        "Prod": "__PRODUCERS__",
        "Mag": "Magazzino",
        "Uni": "Universita",
        "Mura": "Mura",
        "Cas": "Caserma",
        "Sent": "Comando Sentinelle",
        "Carav": "Caravanserraglio",
        "All": "Sala dell'Alleanza",
        "Guerra": "Sala di Guerra",
        "Scud": "Scuderia",
        "Off": "Officina",
        "Best": "Bestiario",
    }
    PRODUCERS = ["Fattoria", "Boscaiolo", "Cava d'Argilla", "Miniera di Ferro", "Miniera d'Oro"]

    def settlement_requirements(self, target_level: int) -> list[tuple[str, int]]:
        text = self.settlement_progression[target_level]["requirements"]
        out: list[tuple[str, int]] = []
        for tok in [t.strip() for t in text.split(",") if t.strip()]:
            m = re.match(r"^([A-Za-z]+)(\d+)$", tok)
            if not m:
                continue  # "Stato iniziale"
            name = self.REQ_TOKEN_MAP.get(m.group(1))
            if name is None:
                raise RuntimeError(f"BLOCKED_SPEC_DIVERGENCE unknown requirement token {tok}")
            out.append((name, int(m.group(2))))
        return out


@lru_cache(maxsize=1)
def get_spec() -> Spec:
    with open(config.SPEC_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return Spec(raw)


def spec_meta() -> dict[str, Any]:
    s = get_spec()
    return {"version": s.version, "spec_hash": s.computed_hash, "status": s.raw["document"]["status"]}
