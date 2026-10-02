/**
 * The first-steps checklist.
 *
 * What we hold it to: nothing is ticked before the player has done it, nothing a new Lord already owns counts as an
 * achievement (spec.player_bootstrap hands out every core building at level 1 and 250 Fanteria), and ordering the
 * work is enough — a box that stays empty for the hours an upgrade takes reads as a bug.
 */
import type { JobDto, SettlementDto } from "@/src/api/hooks";
import { allDone, firstSteps, RESOURCE_BUILDINGS } from "@/src/game/firstSteps";

/** What spec.player_bootstrap gives a Lord the moment they join: every core building at level 1, no research. */
const bootstrap = (over: Partial<SettlementDto> = {}): SettlementDto =>
  ({
    level: 1,
    buildings: Object.fromEntries([...RESOURCE_BUILDINGS, "Castello / Fortezza", "Magazzino", "Caserma", "Universita", "Mura", "Sala della Casata"].map((n) => [n, 1])),
    research: {},
    army: { Fanteria: 250 },
    jobs: [],
    settlement_upgrade: { state: "AVAILABLE", level: 1 },
    ...over,
  }) as SettlementDto;

const job = (kind: JobDto["kind"], target: string): JobDto => ({ kind, target } as JobDto);
const ids = (input: Parameters<typeof firstSteps>[0]) => firstSteps(input).filter((s) => s.done).map((s) => s.id);

describe("a Lord who has just joined", () => {
  it("has nothing ticked, because everything they own came with the realm", () => {
    expect(ids({ settlement: bootstrap(), push: "on" })).toEqual(["push"]);
  });

  it("is not asked for notifications where there are none to ask for", () => {
    expect(firstSteps({ settlement: bootstrap(), push: "unavailable" }).map((s) => s.id)).not.toContain("push");
    expect(firstSteps({ settlement: bootstrap(), push: null }).map((s) => s.id)).not.toContain("push");
    expect(firstSteps({ settlement: bootstrap(), push: "denied" }).map((s) => s.id)).toContain("push");
  });

  it("gets every step while the realm is still loading, rather than a checklist of guesses", () => {
    expect(ids({ settlement: null, push: "off" })).toEqual([]);
  });
});

describe("a step is done when the work is ordered", () => {
  it("counts an upgraded resource source, and a queued one", () => {
    expect(ids({ settlement: bootstrap({ buildings: { ...bootstrap().buildings, Fattoria: 2 } }) })).toEqual(["resource"]);
    expect(ids({ settlement: bootstrap({ jobs: [job("BUILDING", "Boscaiolo")] }) })).toEqual(["resource"]);
    // The Warehouse is not a resource source: upgrading it teaches the wrong lesson.
    expect(ids({ settlement: bootstrap({ jobs: [job("BUILDING", "Magazzino")] }) })).toEqual([]);
  });

  it("counts the settlement upgrade from the moment it is running", () => {
    expect(ids({ settlement: bootstrap({ level: 2 }) })).toEqual(["castle"]);
    expect(ids({ settlement: bootstrap({ settlement_upgrade: { state: "IN_PROGRESS", level: 1, job: job("SETTLEMENT_UPGRADE", "level") } }) })).toEqual(["castle"]);
  });

  it("counts a research that is finished or still in the queue", () => {
    expect(ids({ settlement: bootstrap({ research: { "economy.granary": 1 } }) })).toEqual(["research"]);
    expect(ids({ settlement: bootstrap({ jobs: [job("RESEARCH", "economy.granary")] }) })).toEqual(["research"]);
    expect(ids({ settlement: bootstrap({ research: { "economy.granary": 0 } }) })).toEqual([]);
  });

  it("counts a mission that is running now or was completed before", () => {
    expect(ids({ settlement: bootstrap(), missions: { active: [{}], history: [] } })).toEqual(["mission"]);
    expect(ids({ settlement: bootstrap(), missions: { active: [], history: [{}] } })).toEqual(["mission"]);
    expect(ids({ settlement: bootstrap(), missions: { active: [], history: [] } })).toEqual([]);
  });

  it("counts the alliance the player belongs to", () => {
    expect(ids({ settlement: bootstrap(), alliance: { alliance_id: "all_1", tag: "AAA" } })).toEqual(["alliance"]);
    expect(ids({ settlement: bootstrap(), alliance: null })).toEqual([]);
  });
});

describe("the checklist as a whole", () => {
  it("ends when every step is done", () => {
    const settlement = bootstrap({ level: 2, buildings: { ...bootstrap().buildings, Fattoria: 2 }, research: { "economy.granary": 1 } });
    const input = { settlement, alliance: { alliance_id: "all_1" }, missions: { active: [], history: [{}] }, push: "on" as const };
    expect(allDone(firstSteps(input))).toBe(true);
    expect(allDone(firstSteps({ ...input, push: "off" as const }))).toBe(false);
  });

  it("only ever sends the player where the step can be carried out", () => {
    const steps = firstSteps({ settlement: bootstrap(), push: "off" });
    expect(steps.map((s) => [s.id, s.href])).toEqual([
      ["resource", "/(tabs)/settlement"],
      ["castle", "/(tabs)/settlement"],
      ["research", "/research"],
      ["mission", null], // the checklist already lives on the missions screen
      ["alliance", "/(tabs)/alliance"],
      ["push", "/settings"],
    ]);
  });
});
