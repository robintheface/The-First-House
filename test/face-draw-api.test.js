import { describe, it, expect } from "vitest";
import faceDraw from "../api/face-draw.js";

async function request(method = "POST") {
  let body;
  const res = { statusCode: 0, setHeader() {}, end(value) { body = JSON.parse(value); } };
  await faceDraw({ method, headers: { "x-vercel-forwarded-for": "10.0.0.1" } }, res);
  return { status: res.statusCode, body };
}

describe("unlimited face draws", () => {
  it("allows repeated draws beyond the former daily cap without a store", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await request()).toEqual({ status: 200, body: { ok: true, remaining: null, limit: null, unlimited: true } });
    }
  });
  it("preserves the POST-only endpoint contract", async () => {
    expect(await request("GET")).toEqual({ status: 405, body: { error: "method_not_allowed" } });
  });
});
