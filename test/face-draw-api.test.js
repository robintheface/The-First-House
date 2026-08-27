// Integration tests for /api/face-draw -- the server-side cap on how many
// times a single IP can draw per UTC day. Mirrors the mock-Upstash approach
// in test/leaderboard-api.test.js: a fake REST endpoint stands in for
// Upstash so the real code path (api/_store.js -> fetch -> REST) is what
// gets exercised, not a stub.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { execFileSync } from "node:child_process";

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

// FOD_WHITELIST_IPS is read through require() at load time too, same as
// isConfigured() -- a child process with the env set from the start is
// what actually observes it (see the "no store attached" block below for
// why vi.resetModules() can't).
describe("FOD_WHITELIST_IPS", () => {
  function runWhitelisted(ip, env) {
    const script = `
      const h = require('${process.cwd()}/api/face-draw.js');
      h({ method: 'POST', headers: { 'x-vercel-forwarded-for': '${ip}' }, url: '/api/face-draw' },
        { statusCode: 0, setHeader() {}, end(b) { console.log(this.statusCode + ' ' + b); } });
    `;
    const out = execFileSync(process.execPath, ["-e", script], { env, encoding: "utf8" }).trim();
    const spaceAt = out.indexOf(" ");
    return { status: Number(out.slice(0, spaceAt)), body: JSON.parse(out.slice(spaceAt + 1)) };
  }

  it("skips the daily cap entirely for a whitelisted IP, even with no store attached", () => {
    const env = { ...process.env, FOD_WHITELIST_IPS: "7.7.7.7, 8.8.8.8" };
    delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
    const r = runWhitelisted("7.7.7.7", env);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, remaining: 3, limit: 3, unlimited: true });
  });

  it("still enforces the cap for an IP not on the list", () => {
    const env = { ...process.env, FOD_WHITELIST_IPS: "7.7.7.7" };
    // Not whitelisted, and store not configured in this child env either
    // -> falls through to the normal fail-closed path, not a free pass.
    delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
    const r = runWhitelisted("6.6.6.6", env);
    expect(r.status).toBe(503);
  });
});

// FOD_RATE_LIMIT_DISABLED is a separate, broader lever than the whitelist
// above -- it's meant to unblock *every* IP at once while the draw flow is
// being tested end to end. Same require()-time env, same child-process
// necessity as the whitelist tests above.
describe("FOD_RATE_LIMIT_DISABLED", () => {
  function runWithFlag(env) {
    const script = `
      const h = require('${process.cwd()}/api/face-draw.js');
      h({ method: 'POST', headers: { 'x-vercel-forwarded-for': '20.20.20.20' }, url: '/api/face-draw' },
        { statusCode: 0, setHeader() {}, end(b) { console.log(this.statusCode + ' ' + b); } });
    `;
    const out = execFileSync(process.execPath, ["-e", script], { env, encoding: "utf8" }).trim();
    const spaceAt = out.indexOf(" ");
    return { status: Number(out.slice(0, spaceAt)), body: JSON.parse(out.slice(spaceAt + 1)) };
  }

  it("unblocks every IP, even with no store attached, when set", () => {
    const env = { ...process.env, FOD_RATE_LIMIT_DISABLED: "1" };
    delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
    const r = runWithFlag(env);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, remaining: 3, limit: 3, unlimited: true });
  });

  it("has no effect when unset (falls through to normal fail-closed enforcement)", () => {
    const env = { ...process.env };
    delete env.FOD_RATE_LIMIT_DISABLED;
    delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
    const r = runWithFlag(env);
    expect(r.status).toBe(503);
  });

  it("has no effect when explicitly \"0\"", () => {
    const env = { ...process.env, FOD_RATE_LIMIT_DISABLED: "0" };
    delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN;
    delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
    const r = runWithFlag(env);
    expect(r.status).toBe(503);
  });
});

// api/_store.js reads its env through require() at load time, which
// vi.resetModules() cannot reach -- same issue and same fix as
// leaderboard-api.test.js's "no store attached" describe block: a child
// process started with the store variables stripped is the only way to
// actually observe the unconfigured path.
describe("no store attached", () => {
  it("fails closed (503) rather than allowing unlimited draws", () => {
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
    const out = execFileSync(process.execPath, ["-e", script], { env, encoding: "utf8" }).trim();
    const [status, ...rest] = out.split(" ");
    expect(Number(status)).toBe(503);
    expect(JSON.parse(rest.join(" ")).error).toBe("store_not_configured");
  });
});
