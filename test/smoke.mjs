// Smoke test for the free-provider hub plugin.
// Exercises the provider factory against a mock OpenAI-compatible gateway and
// checks that every catalog entry is exported as a magpie provider.
// Run:  node test/smoke.mjs
import http from "node:http"
import { catalog, makeProvider } from "../lib.mjs"
import * as plugin from "../index.js"

const KEY = "test-key"

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log("ok  -", msg)
}

const server = http.createServer((req, res) => {
  const auth = req.headers["authorization"] || ""
  const path = new URL(req.url, "http://localhost").pathname
  if (req.method === "GET" && path === "/v1/models") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "good-1", context_length: 131072, available: true },
          { id: "good-2", max_output_tokens: 4096, available: true },
          { id: "dead-1", available: false },
        ],
      }),
    )
  }
  if (req.method === "POST" && path === "/v1/chat/completions") {
    let b = ""
    req.on("data", (c) => (b += c))
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, sawAuth: auth, echoed: b }))
    })
    return
  }
  res.writeHead(404)
  res.end("nope")
})

await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/v1`
const input = { client: {}, magpie: { option: () => false, options: () => ({}) } }
const closeServer = () => new Promise((r) => (server.listening ? server.close(() => r()) : r()))

try {
  // every catalog entry is exported as its own provider function
  const ids = Object.keys(catalog)
  ok(ids.length >= 20, `catalog has ${ids.length} free gateways`)
  for (const id of ids) ok(typeof plugin[id] === "function", `export for "${id}" is a provider function`)

  const mk = makeProvider({ id: "mock", name: "Mock Free", baseUrl: base, keysUrl: "https://example.com/keys" })
  const p = await mk(input, {})

  // sign-in: opening the keys page, then pasting the key as the "code" step
  const method = p.auth.methods[0]
  ok(method.type === "oauth", "key provider signs in by opening its keys page")
  const a = await method.authorize({})
  ok(a && a.url === "https://example.com/keys", "authorize gives the keys page url -> " + (a && a.url))
  ok(a && a.method === "code", "the keys page step takes a pasted value")
  ok((await a.callback("  sk-abc123 ")).key === "sk-abc123", "pasted key becomes the provider key")
  ok((await a.callback("")).type === "failed", "empty paste is refused")

  const cfg = { provider: {} }
  await p.config(cfg)
  ok(cfg.provider.mock, "config declares provider mock")
  ok(cfg.provider.mock.api === base, "config api = " + cfg.provider.mock.api)
  ok(cfg.provider.mock.npm === "@ai-sdk/openai-compatible", "uses openai-compatible npm")

  const getAuth = async () => ({ type: "api", key: KEY })
  const o = await p.auth.loader(getAuth)
  ok(o.baseURL === base, "loader baseURL")
  const r = await o.fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "good-1" }),
  })
  ok(r.status === 200, "forwarded request 200")
  ok((await r.json()).sawAuth === "Bearer " + KEY, "gateway saw Bearer key")

  const models = await p.provider.models(cfg.provider.mock, { auth: { type: "api", key: KEY } })
  ok(Object.keys(models).length === 2, "listed 2 available models")
  ok(models["dead-1"] === undefined, "unavailable model dropped")
  ok(models["good-1"].limit.context === 131072, "context mapped")
  ok(models["good-2"].limit.output === 4096, "output mapped")

  // without a key and not keyless: no network, quiet empty (so a page full of
  // un-signed providers is fast and doesn't hit vendors)
  const dead = makeProvider({ id: "dead", name: "Dead", baseUrl: "http://127.0.0.1:1" })
  const pd = await dead(input, {})
  const m0 = await pd.provider.models({ models: {} }, { auth: undefined })
  ok(m0 && Object.keys(m0).length === 0, "no key -> quiet empty, no vendor call")

  // keyless provider lists without a key
  const kl = makeProvider({ id: "kl", name: "Keyless", baseUrl: base, keyless: true })
  const pk = await kl(input, {})
  const mk2 = await pk.provider.models({ models: {} }, { auth: undefined })
  ok(Object.keys(mk2).length === 2, "keyless provider lists models without a key")
  ok(pk.auth.methods[0].keyless === true, "keyless sign-in method declared")

  // gateway down after a good read: models returns the cached list, never throws
  await closeServer()
  const again = await p.provider.models(cfg.provider.mock, { auth: { type: "api", key: KEY } })
  ok(again && Object.keys(again).length === 2, "models returns cached list when gateway is down (no throw)")

  console.log("\nALL SMOKE CHECKS PASSED")
} finally {
  await closeServer()
}
