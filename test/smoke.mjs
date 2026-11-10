// Smoke test for the FreeLLMAPI magpie plugin.
// Starts a mock FreeLLMAPI gateway (OpenAI-compatible /v1), imports the plugin,
// and exercises every hook the magpie host would call:
//   config -> auth.loader -> loader.fetch -> provider.models
// Run:  node test/smoke.mjs
import http from "node:http";
import { FreeLLMAPI } from "../index.js";

const KEY = "freellmapi-testkey";

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log("ok  -", msg);
}

// A mock gateway: requires Bearer KEY on /v1/models and echoes the auth header
// on /v1/chat/completions.
const server = http.createServer((req, res) => {
  const auth = req.headers["authorization"] || "";
  if (req.method === "GET" && req.url === "/v1/models") {
    if (auth !== "Bearer " + KEY) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "bad key" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "groq/llama-3.3-70b-versatile", context_length: 131072, owned_by: "groq" },
          { id: "gemini-2.5-flash", context_length: 1048576, max_output_tokens: 8192 },
          { id: "deepseek-v4" },
        ],
      }),
    );
  }
  if (req.method === "GET" && req.url === "/v1/usage") {
    if (auth !== "Bearer " + KEY) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "unified key only" } }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        object: "usage",
        month: "2026-11",
        resetsAt: "2026-12-01T00:00:00.000Z",
        requests: 42,
        tokens: 1234567,
        byPlatform: [
          { platform: "groq", requests: 30, tokens: 1000000 },
          { platform: "google", requests: 12, tokens: 234567 },
        ],
      }),
    );
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, sawAuth: auth, echoed: body }));
    });
    return;
  }
  res.writeHead(404);
  res.end("nope");
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const input = { client: {}, magpie: { option: () => false, options: () => ({}) } };

try {
  const plugin = await FreeLLMAPI(input, { baseUrl: base });
  ok(typeof plugin.config === "function", "plugin exports config hook");
  ok(plugin.auth && plugin.auth.provider === "freellmapi", "auth.provider id is freellmapi");
  ok(plugin.auth.methods[0].type === "api", "one api-key sign-in method");
  ok(typeof plugin.provider.models === "function", "plugin exports provider.models hook");

  // config: base normalised to /v1, provider declared
  const cfg = { provider: {} };
  await plugin.config(cfg);
  ok(cfg.provider.freellmapi, "config declares provider freellmapi");
  ok(cfg.provider.freellmapi.api === base + "/v1", "config api ends in /v1 -> " + cfg.provider.freellmapi.api);
  ok(cfg.provider.freellmapi.npm === "@ai-sdk/openai-compatible", "uses openai-compatible npm");

  // config must not clobber a user's own entry
  const cfg2 = { provider: { freellmapi: { name: "Mine", api: "http://x/v1", models: {} } } };
  await plugin.config(cfg2);
  ok(cfg2.provider.freellmapi.name === "Mine", "existing provider entry kept");

  // loader: base + fetch that adds Bearer
  const getAuth = async () => ({ type: "api", key: KEY });
  const o = await plugin.auth.loader(getAuth);
  ok(o.baseURL === base + "/v1", "loader baseURL = " + o.baseURL);
  ok(o.apiKey === KEY, "loader apiKey");

  // loader.fetch forwards to the gateway with the Bearer header
  const r = await o.fetch(base + "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gemini-2.5-flash", messages: [] }),
  });
  ok(r.status === 200, "forwarded request answered 200");
  const j = await r.json();
  ok(j.sawAuth === "Bearer " + KEY, "gateway saw Bearer key (got " + j.sawAuth + ")");

  // models: discovered, free:true, limits mapped
  const models = await plugin.provider.models(cfg.provider.freellmapi, { auth: { type: "api", key: KEY } });
  ok(Object.keys(models).length === 3, "listed 3 models");
  ok(models["groq/llama-3.3-70b-versatile"].free === true, "model marked free");
  ok(models["groq/llama-3.3-70b-versatile"].limit.context === 131072, "context mapped");
  ok(models["gemini-2.5-flash"].limit.output === 8192, "max_output mapped");
  ok(models["deepseek-v4"].limit === undefined, "no limit when vendor gives none");

  // usage: month-to-date spend mapped to display-only windows
  const u = await plugin.auth.usage(getAuth);
  ok(typeof plugin.auth.usage === "function", "plugin exports auth.usage hook");
  ok(typeof u.plan === "string" && u.plan.startsWith("FreeLLMAPI"), "usage plan = " + u.plan);
  ok(u.until === "2026-12-01T00:00:00.000Z", "usage until = resetsAt");
  ok(Array.isArray(u.windows) && u.windows.length === 3, "usage windows: all + 2 platforms");
  ok(u.windows[0].name === "All providers" && /1\.2M tokens/.test(u.windows[0].display), "usage total formatted -> " + u.windows[0].display);
  ok(u.windows[1].name === "groq" && u.windows[1].aside === true, "per-platform window is display-only");

  // usage without a key: a clear message, no throw
  const u2 = await plugin.auth.usage(async () => undefined);
  ok(/unified key/.test(u2.error), "usage asks for a unified key when unsigned");

  // signed-in + gateway down: models throws (magpie surfaces it, keeps last)
  const badBase = "http://127.0.0.1:1";
  const bad = await FreeLLMAPI(input, { baseUrl: badBase });
  let threw = false;
  try {
    await bad.provider.models({ models: {} }, { auth: { type: "api", key: KEY } });
  } catch (e) {
    threw = /could not list FreeLLMAPI models/.test(e.message);
  }
  ok(threw, "models hook throws a clear error when signed in and gateway is down");

  // not signed in: returns quietly, no throw
  const quiet = await plugin.provider.models({ models: {} }, { auth: undefined });
  ok(typeof quiet === "object", "models hook returns quietly when not signed in");

  console.log("\nALL SMOKE CHECKS PASSED");
} finally {
  server.close();
}
