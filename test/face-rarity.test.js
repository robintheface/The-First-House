import { describe, it, expect } from "vitest";
import { RARITY_BY_MOOD, rarityFor } from "../js/face-rarity.js";

const TIERS = ["legendary", "mythic", "silver", "bronze", "normal"];

describe("RARITY_BY_MOOD", () => {
  it("only uses the five known tiers", () => {
    for (const [mood, tier] of Object.entries(RARITY_BY_MOOD)) {
      expect(TIERS, mood).toContain(tier);
    }
  });

  // The homepage gallery (index.html, #faces) prints one mood label per face
  // card. Same drift guard as face-jokes.test.js: a mood added, renamed, or
  // removed there should fail loudly here rather than silently drawing with
  // no rarity (falls back to "normal", which is a real tier but should be
  // an explicit choice, not a gap).
  it("has exactly one entry per mood label live on the homepage gallery", async () => {
    const fs = await import("node:fs/promises");
    const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
    const onPage = [...new Set([...html.matchAll(/face-label">([^<]+)</g)].map((m) => m[1]))].sort();
    const inMap = Object.keys(RARITY_BY_MOOD).sort();
    expect(inMap).toEqual(onPage);
  });
});

describe("rarityFor", () => {
  it("returns the mapped tier for a known mood", () => {
    expect(rarityFor("OG")).toBe("legendary");
    expect(rarityFor("Bullish")).toBe("mythic");
    expect(rarityFor("Ape In")).toBe("silver");
    expect(rarityFor("3AM Watch")).toBe("bronze");
    expect(rarityFor("Rekt")).toBe("normal");
  });

  it("falls back to normal for an unknown mood", () => {
    expect(rarityFor("Not A Mood")).toBe("normal");
  });
});
