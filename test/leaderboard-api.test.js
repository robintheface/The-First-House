// Integration tests for the leaderboard endpoints. A mock of Upstash's REST
// API is stood up and the handlers are pointed at it, so the real code path
// (api/_store.js -> fetch -> REST) is what gets exercised, not a stub.
//
// The point of these is the anti-cheat rules: the game runs entirely in the
// browser, so the score arriving at /api/score is whatever the client says
// it is. Every rule that makes that safe is pinned here.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";

let mock, api, base;
const store = { kv: new Map(), z: new Map() };

function startMock() {
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const a = JSON.parse(raw);
      const op = String(a[0]).toUpperCase();
      const key = a[1];
      const zs = () => {
        if (!store.z.has(key)) store.z.set(key, new Map());
        return store.z.get(key);
      };
      let result = null;
      if (op === "SET") { store.kv.set(key, a[2]); result = "OK"; }
      else if (op === "GET") result = store.kv.has(key) ? store.kv.get(key) : null;
      else if (op === "DEL") result = store.kv.delete(key) ? 1 : 0;
      else if (op === "INCR") { const v = Number(store.kv.get(key) || 0) + 1; store.kv.set(key, String(v)); result = v; }
      else if (op === "EXPIRE") result = 1;
      else if (op === "ZADD") {
        const m = zs(), sc = Number(a[3]), mem = a[4];
        const prev = m.has(mem) ? m.get(mem) : -Infinity;
        if (sc > prev) { m.set(mem, sc); result = 1; } else result = 0;
      } else if (op === "ZREVRANGE") {
        const m = zs();
        const s = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[2]), Number(a[3]) + 1);
        result = s.flatMap(([mm, sc]) => [mm, String(sc)]);
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
    });
  });
  return new Promise((r) => mock.listen(0, r));
}

beforeAll(async () => {
  await startMock();
  process.env.KV_REST_API_URL = "http://127.0.0.1:" + mock.address().port;
  process.env.KV_REST_API_TOKEN = "test-token";
  // Imported only once the env is set -- api/_store.js reads it at load time.
  const [runStart, score, leaderboard] = await Promise.all([
    import("../api/run-start.js"),
    import("../api/score.js"),
    import("../api/leaderboard.js")
  ]);
  const routes = {
    "/api/run-start": runStart.default,
    "/api/score": score.default,
    "/api/leaderboard": leaderboard.default
  };
  api = http.createServer((req, res) => {
    const h = routes[req.url.split("?")[0]];
    if (!h) { res.statusCode = 404; return res.end("{}"); }
    req.headers["x-forwarded-for"] = req.headers["x-test-ip"] || "1.2.3.4";
    h(req, res);
  });
  await new Promise((r) => api.listen(0, r));
  base = "http://127.0.0.1:" + api.address().port;
});

afterAll(() => { mock && mock.close(); api && api.close(); });

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
const post = async (p, body, ip) => {
  const r = await fetch(base + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip ? { "x-test-ip": ip } : {}) },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
};
// A token is only spendable once the run has lasted MIN_RUN_MS (1200ms),
// which mirrors the game's own 1s spawn flicker plus a moment of play.
const aged = async () => {
  const { body } = await post("/api/run-start", {});
  await new Promise((r) => setTimeout(r, 1300));
  return body.token;
};

describe("run-start", () => {
  it("issues a 32-hex single-use token", async () => {
    const { body } = await post("/api/run-start", {});
    expect(body.token).toMatch(/^[a-f0-9]{32}$/);
  });
  it("rejects a GET", async () => {
    expect((await get("/api/run-start")).status).toBe(405);
  });
});

describe("score submission", () => {
  it("accepts a plausible run and sanitizes the nickname", async () => {
    const res = await post("/api/score", { token: await aged(), score: 120, nickname: "  Robin  Hood " });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.nickname).toBe("Robin Hood");
  });

  it("puts the run on both the all-time and today boards", async () => {
    const all = await get("/api/leaderboard");
    const today = await get("/api/leaderboard?board=today");
    expect(all.body.entries[0]).toMatchObject({ name: "Robin Hood", score: 120, rank: 1 });
    expect(today.body.board).toBe("today");
    expect(today.body.entries.some((e) => e.name === "Robin Hood")).toBe(true);
  });

  it("keeps a player's best, not their latest", async () => {
    await post("/api/score", { token: await aged(), score: 40, nickname: "Robin Hood" });
    const all = await get("/api/leaderboard");
    expect(all.body.entries.find((e) => e.name === "Robin Hood").score).toBe(120);
  });

  it("gives one row per nickname so nobody can flood the board", async () => {
    const all = await get("/api/leaderboard");
    expect(all.body.entries.filter((e) => e.name === "Robin Hood")).toHaveLength(1);
  });
});

describe("board size", () => {
  it("keeps ten places and reports the size to the client", async () => {
    // Six distinct names, ascending, on their own IP so the shared rate
    // limit budget in the other tests cannot interfere.
    for (let i = 1; i <= 6; i++) {
      const { body } = await post("/api/run-start", {}, "7.7.7.7");
      await new Promise((r) => setTimeout(r, 1300));
      await post("/api/score", { token: body.token, score: i * 10, nickname: "size" + i }, "7.7.7.7");
    }
    const res = await get("/api/leaderboard");
    expect(res.body.size).toBe(10);
    expect(res.body.entries.length).toBeLessThanOrEqual(10);
    // Highest first, and the weakest of the six is the one left out.
    expect(res.body.entries[0].score).toBeGreaterThan(res.body.entries[res.body.entries.length - 1].score);
  }, 30000);
});

describe("anti-cheat", () => {
  it("refuses to spend the same token twice", async () => {
    const token = await aged();
    expect((await post("/api/score", { token, score: 100, nickname: "A" })).status).toBe(200);
    const again = await post("/api/score", { token, score: 100, nickname: "A" });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("token_unknown_or_used");
  });

  it("rejects a score the elapsed run time cannot account for", async () => {
    const res = await post("/api/score", { token: await aged(), score: 999999999, nickname: "Cheater" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("score_implausible");
  });

  it("rejects a run shorter than the game's own spawn beat", async () => {
    const { body } = await post("/api/run-start", {});
    const res = await post("/api/score", { token: body.token, score: 50, nickname: "Speedy" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("run_too_short");
  });

  it("rejects a forged or malformed token", async () => {
    const res = await post("/api/score", { token: "deadbeef", score: 50, nickname: "Forger" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_token");
  });

  it("rejects an empty or blocked nickname", async () => {
    const blank = await post("/api/score", { token: await aged(), score: 50, nickname: "   " });
    expect(blank.body.error).toBe("bad_nickname");
  });

  it("rejects a non-positive score", async () => {
    const res = await post("/api/score", { token: await aged(), score: 0, nickname: "Zero" });
    expect(res.body.error).toBe("bad_score");
  });

  it("rate limits a single IP", async () => {
    let limited = false;
    for (let i = 0; i < 24 && !limited; i++) {
      const { body } = await post("/api/run-start", {}, "9.9.9.9");
      const r = await post("/api/score", { token: body.token, score: 10, nickname: "Spam" + i }, "9.9.9.9");
      if (r.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  }, 20000);
});
