import { describe, it, expect } from "vitest";
import { FACE_JOKES, randomJoke, nextJoke } from "../js/face-jokes.js";

describe("FACE_JOKES", () => {
  it("has a pool of 3-5 jokes for every mood", () => {
    for (const [mood, pool] of Object.entries(FACE_JOKES)) {
      expect(pool.length, mood).toBeGreaterThanOrEqual(3);
      expect(pool.length, mood).toBeLessThanOrEqual(5);
    }
  });

  it("has no duplicate jokes within a single mood's pool", () => {
    for (const [mood, pool] of Object.entries(FACE_JOKES)) {
      expect(new Set(pool).size, mood).toBe(pool.length);
    }
  });

  // The homepage gallery (index.html, #faces) prints one mood label per face
  // card. This is the guard against a mood existing on the page with no
  // joke pool here, or a pool here for a mood that's since been renamed or
  // removed there.
  it("has exactly one entry per mood label live on the homepage gallery", async () => {
    const fs = await import("node:fs/promises");
    const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
    const onPage = [...new Set([...html.matchAll(/face-label">([^<]+)</g)].map((m) => m[1]))].sort();
    const inPool = Object.keys(FACE_JOKES).sort();
    expect(inPool).toEqual(onPage);
  });
});

describe("randomJoke", () => {
  it("returns the first joke when rng returns 0", () => {
    expect(randomJoke("OG", () => 0)).toBe(FACE_JOKES["OG"][0]);
  });

  it("returns the last joke when rng returns just under 1", () => {
    const pool = FACE_JOKES["OG"];
    expect(randomJoke("OG", () => 0.999999)).toBe(pool[pool.length - 1]);
  });

  it("returns an empty string for an unknown mood", () => {
    expect(randomJoke("Not A Mood", () => 0)).toBe("");
  });
});

describe("nextJoke", () => {
  it("never repeats the previous joke, swept across the rng range", () => {
    const pool = FACE_JOKES["OG"];
    for (const previous of pool) {
      for (let i = 0; i < 20; i++) {
        const rng = () => i / 20;
        expect(nextJoke("OG", previous, rng)).not.toBe(previous);
      }
    }
  });

  it("returns an empty string for an unknown mood", () => {
    expect(nextJoke("Not A Mood", "whatever", () => 0)).toBe("");
  });
});
