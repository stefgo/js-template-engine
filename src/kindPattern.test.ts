import { describe, expect, it } from "vitest";
import { matchesKindPattern } from "./index.js";

describe("matchesKindPattern", () => {
    it("matches a kind without a star exactly", () => {
        expect(matchesKindPattern("vrrp.state_changed", "vrrp.state_changed")).toBe(true);
        expect(matchesKindPattern("vrrp.state_changed", "vrrp.state")).toBe(false);
    });

    it("lets a star stand for anything", () => {
        expect(matchesKindPattern("vrrp.incident_opened", "vrrp.*")).toBe(true);
        expect(matchesKindPattern("vrrp.incident_opened", "vrrp.incident_*")).toBe(true);
        expect(matchesKindPattern("keepalived.stopped", "vrrp.*")).toBe(false);
        expect(matchesKindPattern("keepalived.stopped", "*")).toBe(true);
    });

    it("reads everything else literally", () => {
        expect(matchesKindPattern("vrrpXstate_changed", "vrrp.state_changed")).toBe(false);
        expect(matchesKindPattern("a+b", "a+b")).toBe(true);
        expect(matchesKindPattern("aab", "a+b")).toBe(false);
    });
});
