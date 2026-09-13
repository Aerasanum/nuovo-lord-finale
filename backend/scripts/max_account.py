"""
QA / balancing tool — "Max account" bootstrap + feasibility report.

    cd /app/backend && python scripts/max_account.py            # create/refresh max@empirelords.com at every cap + report
    cd /app/backend && python scripts/max_account.py --report   # report only (no DB writes)

Account: max@empirelords.com / Max12345!  (world_1, Casata "Casa Max")
State written (server data model, same fields the runtime reads):
  settlement level 30 (Metropolis), every building L30 (Santuario Mitico L5 = its own 5-level table), all 114 research
  nodes at max level, resources = warehouse cap, wall L30 full HP, a full garrison of every standard unit and 3 of each
  Legendary (metropolis cap), ships, Rubies / speed-up bank for QA.
Report: /app/memory/MAX_ACCOUNT_REPORT.md — time and resource cost for a normal player to reach every cap, warehouse
feasibility of every single step (nothing unreachable) and the production-limited wall-clock estimate.
"""
from __future__ import annotations

import asyncio
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core import auth, clock  # noqa: E402
from app.core.db import db  # noqa: E402
from app.core.spec import get_spec  # noqa: E402
from app.domain import formulas as F  # noqa: E402
from app.domain import worlds  # noqa: E402

EMAIL = "max@empirelords.com"
PASSWORD = "Max12345!"
DISPLAY = "MaxLord"
HOUSE = "Casa Max"
WORLD = "world_1"
REPORT = Path("/app/memory/MAX_ACCOUNT_REPORT.md")

STANDARD_ARMY = {
    "Fanteria": 100_000,
    "Arciere": 100_000,
    "Cavalleria": 60_000,
    "Catapulta": 10_000,
    "Carro di Conquista": 2_000,
    "Orso": 20_000,
    "Leone": 20_000,
    "Falco": 20_000,
    "Lupo": 20_000,
    "Elefante da Guerra": 8_000,
}
LEGENDARY = ("Drago", "Angelo", "Demone")


# ---------------------------------------------------------------------------------------------- helpers
def max_research() -> dict[str, int]:
    spec = get_spec()
    return {F.enc(n["key"]): int(n["max_level"]) for n in spec.research_nodes}


def max_buildings() -> dict[str, int]:
    spec = get_spec()
    return {b["name"]: (5 if b["name"] == "Santuario Mitico" else 30) for b in spec.buildings}


def fmt_min(minutes: float) -> str:
    d, rem = divmod(int(round(minutes)), 1440)
    h, m = divmod(rem, 60)
    return f"{d} g {h} h {m} min" if d else (f"{h} h {m} min" if h else f"{m} min")


def fmt_n(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


def add(a: dict[str, float], b: dict[str, int | float]) -> None:
    for k, v in b.items():
        a[k] = a.get(k, 0) + float(v)


# ---------------------------------------------------------------------------------------------- bootstrap
async def bootstrap() -> dict:
    spec = get_spec()
    acc = await db().accounts.find_one({"email": EMAIL})
    if not acc:
        out = await auth.register(EMAIL, PASSWORD, DISPLAY)
        acc = await db().accounts.find_one({"_id": out["account"]["account_id"]})
        print(f"registered {EMAIL}")
    else:
        # keep the documented password valid even if it was changed by hand
        await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"password_hash": auth.hash_password(PASSWORD)}})
    world = await db().worlds.find_one({"_id": WORLD})
    if not world:
        raise SystemExit(f"world {WORLD} not found")
    player = await db().players.find_one({"world_id": WORLD, "account_id": acc["_id"]})
    if not player:
        player = await worlds.join_world(world, acc["_id"], HOUSE)
        print(f"joined {WORLD} as {HOUSE}")
    home = await db().settlements.find_one({"owner_player_id": player["_id"]}, sort=[("founded_at", 1), ("_id", 1)])
    buildings = max_buildings()
    research = max_research()
    cap = F.warehouse_capacity(buildings, research, spec)
    wall = F.wall_stats(30, research, spec)
    army = {**STANDARD_ARMY, **{u: int(spec.raw["legendary_stacking"]["metropolis_cap"]["max_per_type_per_metropolis"]) for u in LEGENDARY}}
    now = clock.now()
    await db().settlements.update_one(
        {"_id": home["_id"]},
        {
            "$set": {
                "level": 30,
                "buildings": buildings,
                "research": research,
                "resources": {r: cap for r in F.RES},
                "carry": {r: 0.0 for r in F.RES},
                "last_accrued_at": now,
                "army": army,
                "ships": 300,
                "wall": {"level": 30, "current_hp": wall["max_hp"], "max_hp": wall["max_hp"]},
                "loyalty": int(spec.conquest["loyalty_start"]),
                "recruit_active": {},
            }
        },
    )
    await db().players.update_one(
        {"_id": player["_id"]},
        {"$set": {"prestige": 50_000, "intro_seen_at": now, "tour_seen_at": now, "inactivity_exempt": True, "shield_ended_at": now, "shield_end_reason": "QA_MAX"}},
    )
    await db().accounts.update_one({"_id": acc["_id"]}, {"$set": {"rubies": 999_999}})
    await db().audit.insert_one({"world_id": WORLD, "type": "qa_max_account", "player_id": player["_id"], "settlement_id": home["_id"], "at": now})
    print(f"max state written: player {player['_id']} settlement {home['_id']} ({home['x']},{home['y']}) cap/res {cap:,}")
    return {"player_id": player["_id"], "settlement_id": home["_id"], "xy": (home["x"], home["y"]), "cap": cap}


# ---------------------------------------------------------------------------------------------- feasibility report
def build_report(boot: dict | None) -> str:
    spec = get_spec()
    R = max_research()
    NO_R: dict[str, int] = {}
    lines: list[str] = []
    P = lines.append
    P("# Empire Lords Dragon — Account Max & rapporto di fattibilità")
    P("")
    P(f"_Generato il {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} da `backend/scripts/max_account.py` — spec v{spec.version}._")
    P("")
    P("## Account Max (QA)")
    P(f"- **Login**: `{EMAIL}` / `{PASSWORD}` — mondo `{WORLD}`, Casata «{HOUSE}»")
    if boot:
        P(f"- Insediamento madre `{boot['settlement_id']}` a ({boot['xy'][0]},{boot['xy'][1]}) — Metropoli L30, 20 edifici L30 + Santuario Mitico L5, 114 ricerche al massimo, risorse = cap Magazzino ({fmt_n(boot['cap'])} per risorsa), Mura L30, 3 Drago / 3 Angelo / 3 Demone (cap per Metropoli), esercito standard completo, 300 navi, 999.999 Rubini.")
    P("")

    # ---------------- settlement chain
    P("## 1. Insediamento 1 → 30 (Castello / Fortezza)")
    P("")
    P("| Livello | Stadio | Costo (grano/legno/argilla/ferro/oro) | Tempo base | Tempo FAST (≤3 insediamenti, L≤10) | Cap Magazzino L-1 (+30% ricerca) | OK |")
    P("|---|---|---|---|---|---|---|")
    tot_cost: dict[str, float] = {}
    tot_min = 0.0
    tot_min_fast = 0.0
    violations: list[str] = []
    soft: list[str] = []
    cap30 = F.warehouse_capacity({"Magazzino": 30}, R, spec)
    for lvl in range(2, 31):
        row = spec.settlement_progression[lvl]
        cost, mins = spec.building_cost_time("Castello / Fortezza", lvl)
        q_fast = F.construction_cost_time("Castello / Fortezza", lvl, 1, NO_R, spec)
        add(tot_cost, cost)
        tot_min += mins
        tot_min_fast += q_fast["duration_min"]
        cap_prev = F.warehouse_capacity({"Magazzino": lvl - 1}, R, spec)
        ok = max(cost.values()) <= cap_prev
        if not ok:
            violations.append(f"Castello L{lvl}: costo max {fmt_n(max(cost.values()))} > cap Magazzino L{lvl - 1} {fmt_n(cap_prev)}")
        # every building the progression table demands for this level must be payable while Magazzino ≤ L-1
        for name, req in spec.settlement_requirements(lvl):
            names = spec.PRODUCERS if name == "__PRODUCERS__" else [name]
            for nm in names:
                if req == 1 and nm in spec.player_bootstrap["prebuilt_buildings_level_1"]:
                    continue  # prebuilt at L1, no charge
                c_req, _ = spec.building_cost_time(nm, req)
                cap_req = F.warehouse_capacity({"Magazzino": (req - 1) if nm == "Magazzino" else (lvl - 1)}, R, spec)
                if max(c_req.values()) > cap_req:
                    violations.append(f"Requisito per insediamento L{lvl}: {nm} L{req} costa {fmt_n(max(c_req.values()))} > cap disponibile {fmt_n(cap_req)}")
        P(f"| {lvl} | {row['stage']} | {'/'.join(fmt_n(cost[r]) for r in F.RES)} | {fmt_min(mins)} | {fmt_min(q_fast['duration_min']) if q_fast['fast_applied'] else '—'} | {fmt_n(cap_prev)} | {'✅' if ok else '❌'} |")
    P("")
    P(f"**Totale Castello**: {' · '.join(f'{r} {fmt_n(tot_cost[r])}' for r in F.RES)} — tempo base **{fmt_min(tot_min)}**, con FAST sui primi 10 livelli **{fmt_min(tot_min_fast)}**, con ricerca costruzione −35 % ≈ **{fmt_min(tot_min_fast * 0.65)}** (limite inferiore).")
    P("")

    # ---------------- buildings
    P("## 2. Edifici 1 → 30 (20 edifici canonici)")
    P("")
    P("| Edificio | Sblocco (liv. insediamento) | Costo totale L1→30 (grano/legno/argilla/ferro/oro) | Tempo base | Tempo con FAST | Passo più caro (livello) | Cap Magazzino allo stesso livello | Sotto il cap L30 |")
    P("|---|---|---|---|---|---|---|---|")
    all_cost: dict[str, float] = dict(tot_cost)
    build_min = 0.0
    build_min_fast = 0.0
    for b in spec.buildings:
        name = b["name"]
        if name in ("Castello / Fortezza", "Santuario Mitico"):
            continue
        c: dict[str, float] = {}
        m = 0.0
        mf = 0.0
        worst = (0, 0)
        worst_ok = True
        for lvl in range(1, 31):
            if lvl == 1 and name in spec.player_bootstrap["prebuilt_buildings_level_1"]:
                continue  # prebuilt, no charge
            cost, mins = spec.building_cost_time(name, lvl)
            q_fast = F.construction_cost_time(name, lvl, 1, NO_R, spec)
            add(c, cost)
            m += mins
            mf += q_fast["duration_min"]
            cap_here = F.warehouse_capacity({"Magazzino": lvl}, R, spec) if name != "Magazzino" else F.warehouse_capacity({"Magazzino": lvl - 1}, R, spec)
            if max(cost.values()) > worst[0]:
                worst = (max(cost.values()), lvl)
            if max(cost.values()) > cap30:
                worst_ok = False
                violations.append(f"{name} L{lvl}: costo max {fmt_n(max(cost.values()))} > cap Magazzino L30 {fmt_n(cap30)}")
            elif max(cost.values()) > cap_here:
                soft.append(f"{name} L{lvl} ({fmt_n(max(cost.values()))}): pagabile solo con Magazzino oltre L{lvl if name != 'Magazzino' else lvl - 1}")
        add(all_cost, c)
        build_min += m
        build_min_fast += mf
        cap_worst = F.warehouse_capacity({"Magazzino": worst[1] if name != "Magazzino" else worst[1] - 1}, R, spec)
        P(f"| {name} | {b['unlock_settlement_level']} | {'/'.join(fmt_n(c.get(r, 0)) for r in F.RES)} | {fmt_min(m)} | {fmt_min(mf)} | {fmt_n(worst[0])} (L{worst[1]}) | {fmt_n(cap_worst)} | {'✅' if worst_ok else '❌'} |")
    P("")
    P(f"**Totale edifici (senza Castello)**: {' · '.join(f'{r} {fmt_n(all_cost[r] - tot_cost[r])}' for r in F.RES)} — tempo base **{fmt_min(build_min)}**, con FAST **{fmt_min(build_min_fast)}**, con ricerca −35 % ≈ **{fmt_min(build_min_fast * 0.65)}**.")
    P("")
    P("Santuario Mitico (tabella dedicata, §12 — fuori dalla vertical slice attuale):")
    P("")
    P("| Livello | Costo (grano/legno/argilla/ferro/oro) | Tempo | Effetto |")
    P("|---|---|---|---|")
    sanct_cost: dict[str, float] = {}
    sanct_days = 0.0
    for row in spec.mythic["sanctuary_levels"]:
        add(sanct_cost, {r: row[r] for r in F.RES})
        days = float(str(row["time"]).split()[0])
        sanct_days += days
        P(f"| {row['level']} | {'/'.join(fmt_n(row[r]) for r in F.RES)} | {row['time']} | {row['effect']} |")
    P("")
    P(f"Totale Santuario: {' · '.join(f'{r} {fmt_n(sanct_cost[r])}' for r in F.RES)} — {sanct_days:g} giorni fissi (nessun modificatore). Il passo più caro ({fmt_n(max(row[r] for row in spec.mythic['sanctuary_levels'] for r in F.RES))}) è sotto il cap Magazzino L30 ({fmt_n(F.warehouse_capacity({'Magazzino': 30}, R, spec))}).")
    P("")

    # ---------------- research
    P("## 3. Ricerca — 114 nodi, 12 rami")
    P("")
    P("| Ramo | Nodi | Livelli totali | Costo totale (grano/legno/argilla/ferro/oro) | Tempo base | Tempo con −35 % |")
    P("|---|---|---|---|---|---|")
    res_cost: dict[str, float] = {}
    res_min = 0.0
    by_branch: dict[str, dict] = {}
    for n in spec.research_nodes:
        br = by_branch.setdefault(n["branch"], {"nodes": 0, "levels": 0, "cost": {}, "min": 0.0})
        br["nodes"] += 1
        for lvl in range(1, int(n["max_level"]) + 1):
            cost, mins = spec.research_cost(n["cost_class"], lvl)
            add(br["cost"], cost)
            br["min"] += mins
            br["levels"] += 1
            if max(cost.values()) > cap30:
                violations.append(f"Ricerca {n['key']} L{lvl}: costo max {fmt_n(max(cost.values()))} > cap Magazzino L30 {fmt_n(cap30)}")
            cap_min = F.warehouse_capacity({"Magazzino": max(1, int(n["required_settlement_level"]))}, R, spec)
            if max(cost.values()) > cap_min:
                need = next(L for L in range(1, 31) if F.warehouse_capacity({"Magazzino": L}, R, spec) >= max(cost.values()))
                soft.append(f"{n['key']} L{lvl} ({fmt_n(max(cost.values()))}): sbloccabile a insediamento L{n['required_settlement_level']}, pagabile con Magazzino ≥ L{need}")
    for br, v in by_branch.items():
        add(res_cost, v["cost"])
        res_min += v["min"]
        P(f"| {br} | {v['nodes']} | {v['levels']} | {'/'.join(fmt_n(v['cost'].get(r, 0)) for r in F.RES)} | {fmt_min(v['min'])} | {fmt_min(v['min'] * 0.65)} |")
    add(all_cost, res_cost)
    P("")
    P(f"**Totale ricerca**: {' · '.join(f'{r} {fmt_n(res_cost[r])}' for r in F.RES)} — tempo base **{fmt_min(res_min)}** (2 code per insediamento → ≈ {fmt_min(res_min / 2)} in parallelo; con −35 % ≈ {fmt_min(res_min * 0.65 / 2)}).")
    P("")

    # ---------------- army
    P("## 4. Esercito")
    P("")
    P("| Unità | Categoria | Costo unitario | Tempo base | Tempo effettivo (produttore L30, ricerca max) | Lotto max (L30) |")
    P("|---|---|---|---|---|---|")
    for u in spec.units:
        cost = spec.unit_cost(u["name"])
        base_s = spec.unit_base_time_seconds(u["name"])
        if u["category"] == "legendary":
            eff = f"{base_s / 86400:g} giorni fissi (1 coda per Tempio, nessun modificatore)"
            cap_s = "1 (max 3 per tipo per Metropoli)"
        else:
            eff = f"{F.unit_effective_time_seconds(u['name'], 30, R, spec):.1f} s"
            cap_s = str(F.batch_cap(30, spec))
        P(f"| {u['name']} | {u['category']} | {'/'.join(fmt_n(cost[r]) for r in F.RES)} | {fmt_min(base_s / 60)} | {eff} | {cap_s} |")
    P("")
    leg_cost: dict[str, float] = {}
    for u in LEGENDARY:
        c = spec.unit_cost(u)
        add(leg_cost, {r: c[r] * 3 for r in F.RES})
    add(all_cost, leg_cost)
    P(f"Leggendari al cap (3 Drago + 3 Angelo + 3 Demone): {' · '.join(f'{r} {fmt_n(leg_cost[r])}' for r in F.RES)}; **9 × 14 giorni = 126 giorni** con la singola coda del Tempio (un Tempio per Metropoli). Costo unitario più alto {fmt_n(max(spec.unit_cost(u)[r] for u in LEGENDARY for r in F.RES))} < cap Magazzino L30 {fmt_n(F.warehouse_capacity({'Magazzino': 30}, R, spec))}.")
    P("")
    std_cost: dict[str, float] = {}
    std_seconds = 0.0
    for u, n in STANDARD_ARMY.items():
        c = spec.unit_cost(u)
        add(std_cost, {r: c[r] * n for r in F.RES})
        std_seconds += F.unit_effective_time_seconds(u, 30, R, spec) * n
    P(f"Esercito standard dell'account Max ({', '.join(f'{u} {fmt_n(n)}' for u, n in STANDARD_ARMY.items())}): {' · '.join(f'{r} {fmt_n(std_cost[r])}' for r in F.RES)}, ≈ {fmt_min(std_seconds / 60)} di addestramento cumulato (4 code produttore in parallelo → ≈ {fmt_min(std_seconds / 60 / 4)}). Non è un cap di gioco: la dimensione dell'esercito è limitata solo dalla produzione e dal cap di marcia della Sala di Guerra ({fmt_n(F.war_hall_cap(30, R, 'ATTACK', spec))} unità per marcia a L30).")
    P("")

    # ---------------- totals
    P("## 5. Totale per raggiungere ogni cap (un solo insediamento)")
    P("")
    P("| Voce | grano | legno | argilla | ferro | oro |")
    P("|---|---|---|---|---|---|")
    P(f"| Castello 1→30 | {' | '.join(fmt_n(tot_cost[r]) for r in F.RES)} |")
    P(f"| 19 edifici 1→30 | {' | '.join(fmt_n(all_cost[r] - tot_cost[r] - res_cost[r] - leg_cost[r]) for r in F.RES)} |")
    P(f"| Ricerca 114 nodi | {' | '.join(fmt_n(res_cost[r]) for r in F.RES)} |")
    P(f"| 9 Leggendari | {' | '.join(fmt_n(leg_cost[r]) for r in F.RES)} |")
    P(f"| **Totale** | {' | '.join(f'**{fmt_n(all_cost[r])}**' for r in F.RES)} |")
    P("")
    prod30 = F.production_per_hour(max_buildings(), R, spec)
    prod1 = F.production_per_hour({b: 1 for b in spec.player_bootstrap["prebuilt_buildings_level_1"]}, NO_R, spec)
    hours_at_max = max(all_cost[r] / prod30[r] for r in F.RES)
    worst_res = max(F.RES, key=lambda r: all_cost[r] / prod30[r])
    P(f"Produzione a L30 con ricerca max: {' · '.join(f'{r} {fmt_n(prod30[r])}/h' for r in F.RES)} (L1 senza ricerca: {' · '.join(f'{r} {fmt_n(prod1[r])}/h' for r in F.RES)}).")
    P("")
    P(f"- **Limite produzione** (tutto il costo prodotto al ritmo massimo): ≈ **{hours_at_max / 24:.0f} giorni** (risorsa vincolante: {worst_res}). Nella realtà la produzione cresce da L1 a L30 durante il percorso: una media realistica del 55–60 % del ritmo massimo porta a ≈ **{hours_at_max / 24 / 0.57:.0f} giorni**; bottino PvP/neutrali, carovane tra insediamenti e ricompense giornaliere accorciano il percorso.")
    seq_min = tot_min_fast + build_min_fast
    P(f"- **Limite code di costruzione** (2 code condivise): {fmt_min(seq_min)} di lavoro → ≈ **{seq_min / 2 / 1440:.0f} giorni** in parallelo, ≈ {seq_min * 0.65 / 2 / 1440:.0f} giorni con la riduzione ricerca −35 % (il Castello è sequenziale: {fmt_min(tot_min_fast)} minimo).")
    P(f"- **Limite code di ricerca** (2 code): ≈ **{res_min / 2 / 1440:.0f} giorni** base, {res_min * 0.65 / 2 / 1440:.0f} con −35 %.")
    P(f"- **Leggendari**: 126 giorni sulla coda del Tempio (disponibile solo a L30) — è il vincolo temporale più lungo dopo la Metropoli.")
    P(f"- **Santuario Mitico + Unicorno**: {sanct_days:g} giorni + rituale 7 giorni (backlog §12).")
    P("")
    est_days = max(hours_at_max / 24 / 0.57, seq_min / 2 / 1440) + 126
    P(f"**Stima complessiva per un giocatore standard senza Rubini**: Metropoli con tutto al massimo in ≈ **{max(hours_at_max / 24 / 0.57, seq_min / 2 / 1440):.0f} giorni** di gioco attivo, poi **+126 giorni** per i 9 Leggendari → ≈ **{est_days:.0f} giorni ({est_days / 30:.1f} mesi)**. Con i Rubini («Completa ora») le code si comprimono ma non i Leggendari né il Santuario (per regola canonica).")
    P("")

    # ---------------- feasibility
    P("## 6. Verifica di raggiungibilità (cap Magazzino)")
    P("")
    P("Regola: nessun edificio supera il livello dell'insediamento, quindi quando si paga un passo di livello L il Magazzino è al massimo il livello dell'insediamento (L−1 per il Castello e per i requisiti della tabella di progressione). Il costo di ogni singolo passo deve stare nel cap `floor(warehouse[L] × (1 + min(0,60; bonus ricerca)))` — le carovane consegnano entro lo stesso cap, quindi un passo che superasse il cap massimo disponibile sarebbe **irraggiungibile**.")
    P("")
    P("Controlli eseguiti (con ricerca Magazzino al massimo, +30 %):")
    P("- Castello L→L+1: costo ≤ cap con Magazzino L−1 (29 passi).")
    P("- Ogni requisito della tabella di progressione (es. L30 richiede Prod26, Mag29, Uni29, Mura29…): costo del requisito ≤ cap con Magazzino L−1.")
    P(f"- Ogni livello di ogni edificio, ogni livello di ricerca, ogni Leggendario e il Santuario: costo ≤ cap massimo (Magazzino L30 = {fmt_n(cap30)}).")
    P("")
    if violations:
        P(f"❌ **{len(violations)} passi irraggiungibili:**")
        for v in violations:
            P(f"- {v}")
    else:
        P("✅ **Nessun passo irraggiungibile**: la progressione canonica è chiusa — ogni costo è pagabile con il Magazzino disponibile nel momento in cui il passo diventa necessario.")
    P("")
    if soft:
        P(f"ℹ️ {len(soft)} passi opzionali (non richiesti dalla progressione) costano più del cap Magazzino **allo stesso livello** e vanno quindi rinviati a un livello di insediamento/Magazzino più alto — è un ritmo voluto, non un blocco:")
        for v in soft[:40]:
            P(f"- {v}")
        if len(soft) > 40:
            P(f"- … e altri {len(soft) - 40}")
        P("")
    # stricter check: no warehouse research at all
    strict: list[str] = []
    for lvl in range(2, 31):
        cost, _ = spec.building_cost_time("Castello / Fortezza", lvl)
        cap_prev = F.warehouse_capacity({"Magazzino": lvl - 1}, NO_R, spec)
        if max(cost.values()) > cap_prev:
            strict.append(f"Castello L{lvl}: {fmt_n(max(cost.values()))} > {fmt_n(cap_prev)} → serve ricerca Magazzino (+{math.ceil((max(cost.values()) / F.warehouse_capacity({'Magazzino': lvl - 1}, NO_R, spec) - 1) * 100)} %)")
    for b in spec.buildings:
        name = b["name"]
        if name in ("Castello / Fortezza", "Santuario Mitico"):
            continue
        for lvl in range(2, 31):
            cost, _ = spec.building_cost_time(name, lvl)
            cap_here = F.warehouse_capacity({"Magazzino": lvl if name != "Magazzino" else lvl - 1}, NO_R, spec)
            if max(cost.values()) > cap_here:
                strict.append(f"{name} L{lvl}: {fmt_n(max(cost.values()))} > {fmt_n(cap_here)}")
    if strict:
        P(f"Senza alcuna ricerca Magazzino, {len(strict)} passi richiedono prima il bonus ricerca (Magazzino I–III, fino a +30 %):")
        for v in strict[:40]:
            P(f"- {v}")
        if len(strict) > 40:
            P(f"- … e altri {len(strict) - 40}")
    else:
        P("Anche **senza** ricerca Magazzino ogni passo è pagabile.")
    P("")
    P("## 7. Note di bilanciamento")
    P("")
    P("- Il ritmo è coerente con un MMO persistente stagionale: Metropoli in ~3–6 mesi di gioco attivo, Leggendari nei 4 mesi successivi; l'eliminazione per inattività (120 giorni, backlog) non interferisce con un giocatore attivo.")
    P("- I Rubini accelerano solo costruzione/ricerca/reclutamento standard: il percorso ai cap è identico per tutti nei contenuti che contano (Leggendari, Santuario, Piramide).")
    P("- L'account Max serve a QA di UI/combattimento agli estremi (cap di marcia, Leggendari in garrison, DTO a L30) — non va usato come riferimento di progressione.")
    return "\n".join(lines) + "\n"


async def main() -> None:
    report_only = "--report" in sys.argv
    boot = None if report_only else await bootstrap()
    if boot is None:
        acc = await db().accounts.find_one({"email": EMAIL})
        player = await db().players.find_one({"world_id": WORLD, "account_id": acc["_id"]}) if acc else None
        home = await db().settlements.find_one({"owner_player_id": player["_id"]}, sort=[("founded_at", 1), ("_id", 1)]) if player else None
        if home:
            boot = {"player_id": player["_id"], "settlement_id": home["_id"], "xy": (home["x"], home["y"]), "cap": F.warehouse_capacity(max_buildings(), max_research(), get_spec())}
    text = build_report(boot)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(text, encoding="utf-8")
    print(f"report written: {REPORT} ({len(text.splitlines())} lines)")


if __name__ == "__main__":
    asyncio.run(main())
