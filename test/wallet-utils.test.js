import { describe, it, expect } from "vitest";
import { tierFor, shortAddr } from "../js/wallet-utils.js";

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
