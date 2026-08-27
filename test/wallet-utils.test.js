import { describe, it, expect } from "vitest";
import { tierFor, shortAddr, nextTierInfo, splitTierLabel, tierColorVar, tierBlurb } from "../js/wallet-utils.js";

describe("tierFor", () => {
  it("returns 'Not in the hood — yet' for a zero balance", () => {
    expect(tierFor(0)).toBe("👀 Not in the hood — yet");
  });

  it("treats any positive balance below 100,000 as Fresh Face", () => {
    expect(tierFor(1)).toBe("🌱 Fresh Face");
    expect(tierFor(99999)).toBe("🌱 Fresh Face");
  });

  it("is Hood Member at exactly the 100,000 boundary", () => {
    expect(tierFor(100000)).toBe("🧢 Hood Member");
    expect(tierFor(999999)).toBe("🧢 Hood Member");
  });

  it("is Diamond Hood at exactly the 1,000,000 boundary", () => {
    expect(tierFor(1000000)).toBe("💎 Diamond Hood");
    expect(tierFor(9999999)).toBe("💎 Diamond Hood");
  });

  it("is Whale at exactly the 10,000,000 boundary and above", () => {
    expect(tierFor(10000000)).toBe("🐋 Whale");
    expect(tierFor(50000000)).toBe("🐋 Whale");
  });

  it("treats a negative balance the same as zero", () => {
    expect(tierFor(-5)).toBe("👀 Not in the hood — yet");
  });
});

describe("shortAddr", () => {
  it("shortens a standard 42-char address to 0x1234…abcd form", () => {
    const addr = "0x4390B64Db4d9AC2F2D6AA880AAf23de24008C274";
    expect(shortAddr(addr)).toBe("0x4390…C274");
  });

  it("keeps the 0x prefix in the leading chunk", () => {
    const addr = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(shortAddr(addr).startsWith("0xAAAA")).toBe(true);
  });

  it("does not throw on a short/malformed address, even if the output looks odd", () => {
    expect(() => shortAddr("0x1")).not.toThrow();
  });
});

describe("nextTierInfo", () => {
  it("targets Hood Member from a zero balance, at 0% progress", () => {
    expect(nextTierInfo(0)).toEqual({
      name: "Hood Member",
      threshold: 100000,
      remaining: 100000,
      progress: 0
    });
  });

  it("computes partial progress toward the next tier", () => {
    expect(nextTierInfo(50000)).toEqual({
      name: "Hood Member",
      threshold: 100000,
      remaining: 50000,
      progress: 0.5
    });
  });

  it("resets to a new target the moment a threshold is crossed", () => {
    expect(nextTierInfo(100000)).toEqual({
      name: "Diamond Hood",
      threshold: 1000000,
      remaining: 900000,
      progress: 0.1
    });
  });

  it("returns null once past the top tier -- nothing left to climb toward", () => {
    expect(nextTierInfo(10000000)).toBeNull();
    expect(nextTierInfo(50000000)).toBeNull();
  });
});

describe("splitTierLabel", () => {
  it("splits a single-word tier name off its leading emoji", () => {
    expect(splitTierLabel("🐋 Whale")).toEqual({ icon: "🐋", name: "Whale" });
  });

  it("keeps a multi-word tier name intact, em dash included", () => {
    expect(splitTierLabel("👀 Not in the hood — yet")).toEqual({
      icon: "👀",
      name: "Not in the hood — yet"
    });
  });

  it("falls back to an empty name when there's no space to split on", () => {
    expect(splitTierLabel("—")).toEqual({ icon: "—", name: "" });
  });
});

describe("tierColorVar", () => {
  it("matches the same boundaries as tierFor, tier by tier", () => {
    expect(tierColorVar(0)).toBe("var(--ink-dim)");
    expect(tierColorVar(1)).toBe("var(--cream2)");
    expect(tierColorVar(99999)).toBe("var(--cream2)");
    expect(tierColorVar(100000)).toBe("var(--bronze)");
    expect(tierColorVar(999999)).toBe("var(--bronze)");
    expect(tierColorVar(1000000)).toBe("var(--green-bright)");
    expect(tierColorVar(9999999)).toBe("var(--green-bright)");
    expect(tierColorVar(10000000)).toBe("var(--gold)");
    expect(tierColorVar(50000000)).toBe("var(--gold)");
  });

  it("treats a negative balance the same as zero", () => {
    expect(tierColorVar(-5)).toBe("var(--ink-dim)");
  });
});

describe("tierBlurb", () => {
  it("matches the same boundaries as tierFor, tier by tier", () => {
    expect(tierBlurb(0)).toBe("Still watching from outside. There's room for one more.");
    expect(tierBlurb(1)).toBe("First candle's always the hardest. Welcome to the hood.");
    expect(tierBlurb(99999)).toBe("First candle's always the hardest. Welcome to the hood.");
    expect(tierBlurb(100000)).toBe("Not new, not soft. You know how this goes by now.");
    expect(tierBlurb(999999)).toBe("Not new, not soft. You know how this goes by now.");
    expect(tierBlurb(1000000)).toBe("Been through every dip and never once looked away.");
    expect(tierBlurb(9999999)).toBe("Been through every dip and never once looked away.");
    expect(tierBlurb(10000000)).toBe("The tide doesn't move without you. Green days, you did that.");
    expect(tierBlurb(50000000)).toBe("The tide doesn't move without you. Green days, you did that.");
  });

  it("treats a negative balance the same as zero", () => {
    expect(tierBlurb(-5)).toBe("Still watching from outside. There's room for one more.");
  });

  // The ladder page (explore/wallet/ladder) prints these same five lines as
  // static HTML, one per row. This is the guard against them drifting apart:
  // if either copy changes without the other, this fails rather than the
  // wallet result quietly saying something the ladder no longer does.
  it("matches the blurb text live on the ladder page, word for word", async () => {
    const fs = await import("node:fs/promises");
    const html = await fs.readFile(new URL("../explore/wallet/ladder/index.html", import.meta.url), "utf8");
    const onLadder = [...html.matchAll(/hood-ladder-blurb">([^<]+)</g)].map((m) => m[1]);
    const fromTierBlurb = [10000000, 1000000, 100000, 1, 0].map(tierBlurb);
    expect(onLadder).toEqual(fromTierBlurb);
  });
});
