/**
 * Notification deep links (spec.notification_policy.required_fields includes deep_link).
 *
 * The point of the table is that the inbox and a tapped push resolve the same event to the same screen; before the
 * mapping was extracted, only the inbox had one.
 */
import { routeFor } from "@/src/game/deepLink";

describe("the catalog's deep links", () => {
  it("each land where the event happened", () => {
    expect(routeFor({ event: "SENTINEL_LOST", deep_link: "map/sentinel" })).toBe("/marches");
    expect(routeFor({ event: "DIPLOMACY_STATE_CHANGED", deep_link: "alliance/diplomacy" })).toBe("/alliance/diplomacy");
    expect(routeFor({ event: "MERCENARY_CONTRACT_ACTIVE", deep_link: "alliance/mercenary" })).toBe("/alliance/mercenary");
    expect(routeFor({ event: "OWNERSHIP_CHANGED", deep_link: "settlement" })).toBe("/(tabs)/settlement");
    expect(routeFor({ event: "INACTIVITY_WARNING", deep_link: "settings" })).toBe("/settings");
    expect(routeFor({ event: "STORE_PURCHASE", deep_link: "store" })).toBe("/store");
    expect(routeFor({ event: "GRANDE_MONDO_PHASE", deep_link: "grande-mondo" })).toBe("/grande-mondo");
  });

  it("carry the id when the screen needs one", () => {
    expect(routeFor({ event: "PYRAMID_STATE_CHANGED", deep_link: "pyramid?id=pyr_7" })).toEqual({ pathname: "/pyramid", params: { id: "pyr_7" } });
    expect(routeFor({ event: "PYRAMID_ATTACK_INCOMING", deep_link: "pyramid" })).toBe("/pyramid");
    expect(routeFor({ event: "BATTLE_REPORT_READY", deep_link: "inbox", payload: { battle_id: "btl_3" } })).toEqual({ pathname: "/battle/[id]", params: { id: "btl_3" } });
  });

  it("fall back to the inbox, which holds every notification whatever its link says", () => {
    expect(routeFor({ event: "RUBY_TRANSACTION", deep_link: "inbox" })).toBe("/(tabs)/inbox");
    expect(routeFor({ event: "SOMETHING_NEW", deep_link: "a-screen-that-does-not-exist-yet" })).toBe("/(tabs)/inbox");
  });

  it("go nowhere when there is no link at all", () => {
    expect(routeFor({ event: "SENTINEL_LOST" })).toBeNull();
    expect(routeFor({ event: "SENTINEL_LOST", deep_link: null })).toBeNull();
  });
});
