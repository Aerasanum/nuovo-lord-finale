"""QA / simulator endpoints — env-gated (QA_ENDPOINTS_ENABLED) and admin-key protected.
They never edit production timestamps: the injectable clock offset is advanced and due events are processed."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core import clock, config
from app.core.auth import require_admin
from app.core.db import db
from app.core.errors import ApiError
from app.domain import scheduler

router = APIRouter(prefix="/api/qa", tags=["qa"], dependencies=[Depends(require_admin)])


def _gate() -> None:
    if not config.QA_ENDPOINTS_ENABLED:
        raise ApiError("QA_DISABLED", "QA endpoints are disabled", 403)


class AdvanceIn(BaseModel):
    seconds: float = Field(gt=0, le=90 * 86400)


@router.get("/clock")
async def get_clock():
    _gate()
    return {"now": clock.iso(clock.now()), "offset_seconds": clock.get_offset_seconds()}


@router.post("/clock/advance")
async def advance(body: AdvanceIn):
    _gate()
    clock.advance(body.seconds)
    await clock.persist_offset()
    processed = await scheduler.run_due_once(limit=5000)
    return {"now": clock.iso(clock.now()), "offset_seconds": clock.get_offset_seconds(), "events_processed": processed}


@router.post("/scheduler/run")
async def run_scheduler():
    _gate()
    return {"events_processed": await scheduler.run_due_once(limit=5000), "metrics": scheduler.metrics()}


@router.post("/clock/reset")
async def reset_clock():
    """Bring the game clock back to real time: every stored datetime is shifted by −offset (relative timers untouched)."""
    _gate()
    from app.core.clock_shift import reset_to_real_time

    return await reset_to_real_time()


class GrantIn(BaseModel):
    settlement_id: str
    resources: dict[str, int] | None = None
    army: dict[str, int] | None = None
    buildings: dict[str, int] | None = None
    research: dict[str, int] | None = None
    level: int | None = None
    end_pvp_shield: bool = False


@router.post("/grant")
async def grant(body: GrantIn):
    """Test fixture helper (QA only): set state directly so long canonical timers can be exercised."""
    _gate()
    sets: dict = {}
    for r, v in (body.resources or {}).items():
        sets[f"resources.{r}"] = int(v)
    for u, v in (body.army or {}).items():
        sets[f"army.{u}"] = int(v)
    for b, v in (body.buildings or {}).items():
        sets[f"buildings.{b}"] = int(v)
    for k, v in (body.research or {}).items():
        sets[f"research.{k.replace(chr(46), chr(95) * 2)}"] = int(v)
    if body.level is not None:
        sets["level"] = int(body.level)
        sets["buildings.Castello / Fortezza"] = int(body.level)
    # Bible invariant: no building may exceed the settlement level — a grant that lifts a building above the current
    # level lifts the settlement (and its Castello) with it, so QA fixtures can never produce impossible states
    if body.buildings:
        cur = await db().settlements.find_one({"_id": body.settlement_id}, {"level": 1})
        if not cur:
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found", 404)
        top = max(int(v) for b, v in body.buildings.items() if b != "Santuario Mitico")
        lvl = int(sets.get("level", cur["level"]))
        if top > lvl:
            sets["level"] = min(30, top)
            sets["buildings.Castello / Fortezza"] = min(30, top)
    if body.end_pvp_shield:
        s = await db().settlements.find_one({"_id": body.settlement_id}, {"owner_player_id": 1})
        if not s or not s.get("owner_player_id"):
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found or unowned", 404)
        await db().players.update_one({"_id": s["owner_player_id"], "shield_ended_at": None}, {"$set": {"shield_ended_at": clock.now(), "shield_end_reason": "QA"}})
        sets["_shield_ended"] = True
    if not sets:
        raise ApiError("NOTHING_TO_GRANT", "Empty grant", 400)
    sets.pop("_shield_ended", None)
    if sets:
        res = await db().settlements.update_one({"_id": body.settlement_id}, {"$set": sets})
        if res.matched_count == 0:
            raise ApiError("SETTLEMENT_NOT_FOUND", "Settlement not found", 404)
    return {"ok": True, "set": sets, "pvp_shield_ended": body.end_pvp_shield}


class ConquerIn(BaseModel):
    settlement_id: str
    player_id: str


@router.post("/conquer")
async def qa_conquer(body: ConquerIn):
    """Test fixture: hand a NEUTRAL settlement to a player through the real ownership state machine (cap20, retention, territory)."""
    _gate()
    from app.domain import conquest

    target = await db().settlements.find_one({"_id": body.settlement_id})
    player = await db().players.find_one({"_id": body.player_id})
    if not target or not player:
        raise ApiError("NOT_FOUND", "Settlement or player not found", 404)
    if not await conquest.reserve_slot(player["_id"]):
        raise ApiError("CAP20_REACHED", "Player already owns 20 settlements", 409)
    res = await conquest.transfer_ownership(target, player, {}, f"qa_{clock.now().timestamp():.0f}")
    return {"ok": res.get("changed", False), **res}


class EmeraldsIn(BaseModel):
    alliance_id: str
    amount: int = Field(gt=0, le=10_000_000)


@router.post("/alliance/emeralds")
async def qa_emeralds(body: EmeraldsIn):
    """Test fixture: credit an alliance treasury through the real append-only ledger (mercenary escrow needs ≥1.000)."""
    _gate()
    from app.domain import alliances

    a = await db().alliances.find_one({"_id": body.alliance_id, "status": "ACTIVE"})
    if not a:
        raise ApiError("ALLIANCE_NOT_FOUND", "Alliance not found", 404)
    ok = await alliances.credit_emeralds(a["world_id"], a["_id"], body.amount, "qa_grant", f"qa_{clock.now().timestamp():.3f}")
    fresh = await db().alliances.find_one({"_id": a["_id"]}, {"emeralds": 1})
    return {"ok": ok, "emeralds": int(fresh.get("emeralds", 0))}


class RubiesIn(BaseModel):
    email: str
    amount: int = Field(gt=0, le=10_000_000)


@router.post("/rubies")
async def qa_rubies(body: RubiesIn):
    """Test fixture (Play Billing catalog is empty by spec): credit an account wallet through the real ledger."""
    _gate()
    from app.domain import premium

    acc = await db().accounts.find_one({"email": body.email.lower().strip()})
    if not acc:
        raise ApiError("ACCOUNT_NOT_FOUND", "Account not found", 404)
    tx = await premium.grant(acc["_id"], body.amount, "QA_GRANT", {"note": "qa"}, f"qa_{clock.now().timestamp():.3f}")
    return {"ok": True, "rubies": int(tx["balance_after"])}


# --------------------------------------------------------------------------- pyramid (Bible §21) — configurable cycle
class PyramidConfigIn(BaseModel):
    world_id: str
    config: dict
    pyramid_id: str | None = None  # Grande Mondo: "<world>" (Grande Piramide) or "<world>:<REG>" (Piccola Piramide)
    all_regions: bool = False


class PyramidWorldIn(BaseModel):
    world_id: str
    clear_config: bool = False
    config: dict | None = None
    pyramid_id: str | None = None


@router.get("/pyramid/config")
async def qa_pyramid_config_get(world_id: str, pyramid_id: str | None = None):
    """Effective Pyramid parameters (spec defaults ⊕ kind defaults ⊕ per-world override) and the current cycle state."""
    _gate()
    from app.domain import pyramid

    world = await db().worlds.find_one({"_id": world_id})
    if not world:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
    doc = await pyramid.ensure_state(world, pyramid_id)
    override = world.get("pyramid_config") or {} if doc.get("kind") != "REGIONAL" else (world.get("pyramid_regional_config") or {})
    return {"id": doc["_id"], "kind": doc.get("kind"), "config": pyramid.config(world, pyramid_id), "override": override, "state": doc["state"], "cycle_id": doc["cycle_id"], "deadline": clock.iso(doc.get("deadline")), "owner_alliance_id": doc.get("owner_alliance_id"), "pyramids": [i["id"] for i in pyramid.instances(world)]}


@router.put("/pyramid/config")
async def qa_pyramid_config_set(body: PyramidConfigIn):
    """Admin override of the cycle parameters (first_open_day, hold_hours, reward_days, dormant_days, garrison_cap_units,
    reward{...}, emeralds{...}, prestige{...}, guardian{...}). Deep-merged; the pending deadline is re-derived."""
    _gate()
    from app.domain import pyramid

    return await pyramid.set_config(body.world_id, body.config, body.pyramid_id, body.all_regions)


@router.post("/pyramid/reset")
async def qa_pyramid_reset(body: PyramidWorldIn):
    """Test fixture: back to DORMANT_INITIAL with the current config (pending Pyramid events cancelled)."""
    _gate()
    from app.domain import pyramid

    doc = await pyramid.reset(body.world_id, body.clear_config, body.config, body.pyramid_id)
    return {"id": doc["_id"], "state": doc["state"], "cycle_id": doc["cycle_id"], "deadline": clock.iso(doc.get("deadline")), "config": pyramid.config(await db().worlds.find_one({"_id": body.world_id}), body.pyramid_id)}


# --------------------------------------------------------------------------- Grande Mondo (Bibbia GM) — phase control
class GmPhaseIn(BaseModel):
    world_id: str
    to: str  # WAR | ISOLATION


@router.post("/grande-mondo/phase")
async def qa_gm_phase(body: GmPhaseIn):
    """Test fixture: force the fog to fall (WAR) or return (ISOLATION) now, through the real transition (notices, chronicle, next deadline)."""
    _gate()
    from app.domain import grande_mondo

    world = await db().worlds.find_one({"_id": body.world_id})
    if not world or not grande_mondo.is_grande_mondo(world):
        raise ApiError("WORLD_NOT_FOUND", "Grande Mondo not found", 404)
    world = await grande_mondo.transition(world, body.to.upper(), reason="QA")
    return grande_mondo.dto(world)



# --------------------------------------------------------------------------- inactivity (3 gg nei primi 30 gg, poi 120 gg)
class InactivityConfigIn(BaseModel):
    world_id: str
    config: dict | None = None  # {early_phase_days, early_timeout_days, timeout_days, sweep_hours, only_player_ids} — None clears the override


@router.put("/inactivity/config")
async def qa_inactivity_config(body: InactivityConfigIn):
    """Test fixture: per-world override of the inactivity thresholds (cleared with config=null)."""
    _gate()
    from app.domain import inactivity

    world = await db().worlds.find_one({"_id": body.world_id})
    if not world:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
    if body.config is None:
        await db().worlds.update_one({"_id": body.world_id}, {"$unset": {"inactivity_config": ""}})
    else:
        if not body.config.get("only_player_ids"):
            # a shortened threshold on a live World would sweep every idle test/fixture Player: refuse without a scope
            raise ApiError("SCOPE_REQUIRED", "inactivity_config needs only_player_ids (the Players the override applies to)", 400)
        await db().worlds.update_one({"_id": body.world_id}, {"$set": {"inactivity_config": body.config}})
    return {"world_id": body.world_id, "rule": inactivity.rule(await db().worlds.find_one({"_id": body.world_id}))}


class InactivityTouchIn(BaseModel):
    player_id: str
    days_ago: float = Field(ge=0, le=100000)
    exempt: bool | None = None


@router.post("/inactivity/touch")
async def qa_inactivity_touch(body: InactivityTouchIn):
    """Test fixture: backdate a Player's last activity (and optionally flip the QA exemption)."""
    _gate()
    from datetime import timedelta

    sets: dict = {"last_active_at": clock.now() - timedelta(days=body.days_ago)}
    if body.exempt is not None:
        sets["inactivity_exempt"] = body.exempt
    res = await db().players.update_one({"_id": body.player_id}, {"$set": sets})
    if not res.matched_count:
        raise ApiError("PLAYER_NOT_FOUND", "Player not found", 404)
    return {"player_id": body.player_id, "last_active_at": clock.iso(sets["last_active_at"]), "exempt": sets.get("inactivity_exempt")}


class InactivitySweepIn(BaseModel):
    world_id: str


@router.post("/inactivity/sweep")
async def qa_inactivity_sweep(body: InactivitySweepIn):
    """Test fixture: run the inactivity sweep for a world now (same code path as the scheduled event)."""
    _gate()
    from app.domain import inactivity

    world = await db().worlds.find_one({"_id": body.world_id})
    if not world:
        raise ApiError("WORLD_NOT_FOUND", "World not found", 404)
    eliminated = await inactivity.sweep_world(world)
    return {"world_id": body.world_id, "rule": inactivity.rule(world), "eliminated": eliminated}


class PurgePlayersIn(BaseModel):
    player_ids: list[str] = Field(min_length=1, max_length=100)


@router.post("/players/purge")
async def qa_purge_players(body: PurgePlayersIn):
    """Test teardown: remove throwaway Players and hand their spawn slots straight back.

    A realm has a fixed number of seats (100 on the QA realm). Without this the e2e suite leaks one seat per run
    until every join answers WORLD_FULL and the whole suite starts failing on state no test created. Runs the same
    code path as the inactivity removal, so no slot bookkeeping can drift.
    """
    _gate()
    from app.domain import inactivity

    out = []
    for pid in body.player_ids:
        player = await db().players.find_one({"_id": pid})
        if not player:
            out.append({"player_id": pid, "removed": False, "reason": "PLAYER_NOT_FOUND"})
            continue
        world = await db().worlds.find_one({"_id": player["world_id"]})
        if not world:
            out.append({"player_id": pid, "removed": False, "reason": "WORLD_NOT_FOUND"})
            continue
        result = await inactivity.eliminate(world, player, "REMOVE")
        out.append({"player_id": pid, "removed": result is not None, **(result or {})})
    return {"purged": out}


# --------------------------------------------------------------------------- Santuario Mitico / Unicorno (Bible §12)
class MythicIn(BaseModel):
    player_id: str
    sanctuary_level: int | None = Field(default=None, ge=0, le=5)
    unicorn_state: str | None = None  # NONE | READY (test fixture shortcuts; READY skips the 7-day ritual)


@router.post("/mythic")
async def qa_mythic(body: MythicIn):
    """Test fixture: set the player-wide Sanctuary level and/or the Unicorn state directly."""
    _gate()
    from app.domain import mythic

    sets: dict = {}
    if body.sanctuary_level is not None:
        sets["sanctuary.level"] = int(body.sanctuary_level)
    if body.unicorn_state is not None:
        if body.unicorn_state not in ("NONE", "READY"):
            raise ApiError("INVALID_STATE", "unicorn_state must be NONE or READY", 400)
        sets["unicorn"] = {"state": body.unicorn_state, "qa": True}
    if not sets:
        raise ApiError("NOTHING_TO_GRANT", "Empty grant", 400)
    res = await db().players.update_one({"_id": body.player_id}, {"$set": sets})
    if not res.matched_count:
        raise ApiError("PLAYER_NOT_FOUND", "Player not found", 404)
    p = await db().players.find_one({"_id": body.player_id})
    return {"sanctuary_level": mythic.sanctuary_level(p), "unicorn": mythic.unicorn_dto(p)}


# --------------------------------------------------------------------------- «Riepilogo rientro»
class ReturnArmIn(BaseModel):
    player_id: str
    hours_ago: float = Field(gt=0, le=100000)


@router.post("/return-summary/arm")
async def qa_return_arm(body: ReturnArmIn):
    """Test fixture: pretend the Player's previous session ended `hours_ago` hours ago (arms the digest)."""
    _gate()
    from datetime import timedelta

    since = clock.now() - timedelta(hours=body.hours_ago)
    res = await db().players.update_one({"_id": body.player_id}, {"$set": {"return_since": since, "return_pending": True, "last_active_at": clock.now()}})
    if not res.matched_count:
        raise ApiError("PLAYER_NOT_FOUND", "Player not found", 404)
    return {"player_id": body.player_id, "return_since": clock.iso(since), "return_pending": True}



# --------------------------------------------------------------------------- Prestige (march-skin rewards, Bible §41.3)
class PrestigeIn(BaseModel):
    player_id: str
    points: int = Field(gt=0, le=1_000_000)


@router.post("/prestige")
async def qa_prestige(body: PrestigeIn):
    """Test fixture: award Prestige through the canonical path (house history + skin-unlock Inbox rewards)."""
    _gate()
    from app.domain import progress

    p = await db().players.find_one({"_id": body.player_id}, projection={"world_id": 1})
    if not p:
        raise ApiError("PLAYER_NOT_FOUND", "Player not found", 404)
    await progress.award_prestige(p["world_id"], body.player_id, body.points, "qa_grant", f"qa:{clock.now().timestamp()}")
    p = await db().players.find_one({"_id": body.player_id}, projection={"prestige": 1})
    return {"player_id": body.player_id, "prestige": int(p.get("prestige", 0))}


# --------------------------------------------------------------------------- Negozio (simulated validated purchase)
class StorePurchaseIn(BaseModel):
    product_id: str
    account_id: str | None = None
    email: str | None = None
    transaction_id: str | None = None


@router.post("/store/purchase")
async def qa_store_purchase(body: StorePurchaseIn):
    """Test fixture: pretend Google Play + RevenueCat validated this pack → same grant path as the webhook."""
    _gate()
    import uuid

    from app.domain import store

    acc = await db().accounts.find_one({"_id": body.account_id} if body.account_id else {"email": (body.email or "").lower()}, {"_id": 1})
    if not acc:
        raise ApiError("ACCOUNT_NOT_FOUND", "Account not found", 404)
    return await store.grant_purchase(acc["_id"], body.product_id, body.transaction_id or f"QA.{uuid.uuid4().hex[:12]}", "QA", "SANDBOX")
