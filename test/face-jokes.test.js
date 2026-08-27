import { describe, it, expect } from "vitest";
import { FACE_JOKES, jokeOfTheDay, randomJoke, nextJoke } from "../js/face-jokes.js";

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

describe("jokeOfTheDay", () => {
  it("always returns a joke from that mood's own pool", () => {
    for (const mood of Object.keys(FACE_JOKES)) {
      expect(FACE_JOKES[mood]).toContain(jokeOfTheDay(mood, new Date(2026, 0, 15)));
    }
  });

  it("is deterministic for the same mood and calendar day, any time of day", () => {
    const morning = jokeOfTheDay("OG", new Date(2026, 5, 3, 0, 0, 1));
    const night = jokeOfTheDay("OG", new Date(2026, 5, 3, 23, 59, 59));
    expect(morning).toBe(night);
  });

  // Not guaranteed for every mood/date pair, but true for this pinned pair
  // -- pins the rotation as actually rotating, not stuck on one joke.
  it("can differ from one day to the next", () => {
    const day1 = jokeOfTheDay("Rekt", new Date(2026, 0, 1));
    const day2 = jokeOfTheDay("Rekt", new Date(2026, 0, 2));
    expect(day1).not.toBe(day2);
  });

  it("returns an empty string for an unknown mood", () => {
    expect(jokeOfTheDay("Not A Mood", new Date(2026, 0, 1))).toBe("");
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
