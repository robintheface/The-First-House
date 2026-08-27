// Integration tests for /api/face-draw -- the server-side cap on how many
// times a single IP can draw per UTC day. Mirrors the mock-Upstash approach
// in test/leaderboard-api.test.js: a fake REST endpoint stands in for
// Upstash so the real code path (api/_store.js -> fetch -> REST) is what
// gets exercised, not a stub.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";

let mock, api, base;
const store = { kv: new Map(), ttl: new Map() };

function startMock() {
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const a = JSON.parse(raw);
      const op = String(a[0]).toUpperCase();
      const key = a[1];
      let result = null;
      if (op === "INCR") { const v = Number(store.kv.get(key) || 0) + 1; store.kv.set(key, String(v)); result = v; }
      else if (op === "EXPIRE") { store.ttl.set(key, Number(a[2])); result = 1; }
      else if (op === "GET") result = store.kv.has(key) ? store.kv.get(key) : null;
      else if (op === "DEL") { store.ttl.delete(key); result = store.kv.delete(key) ? 1 : 0; }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
    });
  });
  return new Promise((r) => mock.listen(0, r));
}

beforeAll(async () => {
  await startMock();
  process.env.VERCEL = "1";
  process.env.KV_REST_API_URL = "http://127.0.0.1:" + mock.address().port;
  process.env.KV_REST_API_TOKEN = "test-token";
  // Imported only once the env is set -- api/_store.js reads it at load time.
  const faceDraw = (await import("../api/face-draw.js")).default;
  api = http.createServer((req, res) => {
    // Stand in for Vercel's edge, same as leaderboard-api.test.js: writes
    // its own header from the real peer, x-test-ip is this suite's way of
    // saying "the request really came from here".
    req.headers["x-vercel-forwarded-for"] = req.headers["x-test-ip"] || "9.9.9.9";
    faceDraw(req, res);
  });
  await new Promise((r) => api.listen(0, r));
  base = "http://127.0.0.1:" + api.address().port;
});

afterAll(() => { mock && mock.close(); api && api.close(); });

const draw = async (ip) => {
  const r = await fetch(base + "/api/face-draw", {
    method: "POST",
    headers: ip ? { "x-test-ip": ip } : {}
  });
  return { status: r.status, body: await r.json() };
};

describe("POST /api/face-draw", () => {
  it("rejects a non-POST method", async () => {
    const r = await fetch(base + "/api/face-draw", { method: "GET" });
    expect(r.status).toBe(405);
  });

  it("allows the first three draws from a fresh IP, in order", async () => {
    const ip = "10.0.0.1";
    const first = await draw(ip);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, remaining: 2, limit: 3 });

    const second = await draw(ip);
    expect(second.status).toBe(200);
    expect(second.body.remaining).toBe(1);

    const third = await draw(ip);
    expect(third.status).toBe(200);
    expect(third.body.remaining).toBe(0);
  });

  it("rejects the fourth draw from the same IP with 429", async () => {
    const ip = "10.0.0.2";
    await draw(ip); await draw(ip); await draw(ip);
    const fourth = await draw(ip);
    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({ error: "rate_limited", remaining: 0, limit: 3 });
  });

  it("keeps rejecting further draws from the same IP past the fourth", async () => {
    const ip = "10.0.0.3";
    await draw(ip); await draw(ip); await draw(ip); await draw(ip);
    const fifth = await draw(ip);
    expect(fifth.status).toBe(429);
  });

  it("tracks separate IPs independently", async () => {
    const ipA = "10.0.0.4", ipB = "10.0.0.5";
    await draw(ipA); await draw(ipA); await draw(ipA);
    const aFourth = await draw(ipA);
    expect(aFourth.status).toBe(429);
    // A different IP still has its own fresh allowance.
    const bFirst = await draw(ipB);
    expect(bFirst.status).toBe(200);
    expect(bFirst.body.remaining).toBe(2);
  });
});

// api/_store.js reads its env through require() at load time, which
// vi.resetModules() cannot reach -- same issue and same fix as
// leaderboard-api.test.js's "no store attached" describe block: a child
// process started with the store variables stripped is the only way to
// actually observe the unconfigured path.
describe("no store attached", () => {
  it("fails closed (503) rather than allowing unlimited draws", async () => {
    const script = `
      const h = require('${process.cwd()}/api/face-draw.js');
      h({ method: 'POST', headers: {}, url: '/api/face-draw' },
        { statusCode: 0, setHeader() {}, end(b) { console.log(this.statusCode + ' ' + b); } });
    `;
    const env = { ...process.env };
    delete env.KV_REST_API_URL;
    delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, ["-e", script], { env, encoding: "utf8" }).trim();
    const [status, ...rest] = out.split(" ");
    expect(Number(status)).toBe(503);
    expect(JSON.parse(rest.join(" ")).error).toBe("store_not_configured");
  });
});
