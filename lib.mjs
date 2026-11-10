// Free-provider hub for magpie — the useful part of FreeLLMAPI, brought into
// magpie natively (no separate freellmapi server to run).
//
// Each entry below is an OpenAI-compatible free LLM gateway. The plugin
// exposes every one as its own magpie provider: you paste that provider's own
// key once in magpie, magpie lists its models and can route/fail over across
// them (routing groups), which is what FreeLLMAPI's aggregation did for you.
//
// Base URLs are taken from FreeLLMAPI's own provider registry
// (server/src/providers/index.ts + the dedicated adapters). To add or drop a
// gateway, edit this catalog; nothing else needs changing.

export const catalog = {
  // ---- major / well-known free tiers ----
  cerebras: { name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  huggingface: { name: "HuggingFace Router", baseUrl: "https://router.huggingface.co/v1" },
  cohere: { name: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1" },
  opencode: { name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1" },
  kilo: { name: "Kilo Gateway", baseUrl: "https://api.kilo.ai/api/gateway/v1" },
  ovh: { name: "OVH AI Endpoints", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" },
  reka: { name: "Reka", baseUrl: "https://api.reka.ai/v1" },
  requesty: { name: "Requesty", baseUrl: "https://router.requesty.ai/v1" },
  routeway: { name: "Routeway", baseUrl: "https://api.routeway.ai/v1" },
  llm7: { name: "LLM7", baseUrl: "https://api.llm7.io/v1", keyless: true },
  pollinations: { name: "Pollinations", baseUrl: "https://gen.pollinations.ai/v1", keyless: true },

  // ---- free-grant / shared-quota gateways ----
  iteracompute: { name: "IteraCompute", baseUrl: "https://api.iteracompute.com/v1" },
  xkiro: { name: "xKiro", baseUrl: "https://api.xkiro.com/v1" },
  navy: { name: "NavyAI", baseUrl: "https://api.navy/v1" },
  nara: { name: "NaraRouter", baseUrl: "https://router.bynara.id/v1" },
  sealion: { name: "SEA-LION", baseUrl: "https://api.sea-lion.ai/v1" },
  orcarouter: { name: "OrcaRouter", baseUrl: "https://api.orcarouter.ai/v1" },
  unorouter: { name: "UnoRouter", baseUrl: "https://api.unorouter.com/v1" },
  bai: { name: "B.AI", baseUrl: "https://api.b.ai/v1" },
  agnes: { name: "Agnes AI", baseUrl: "https://apihub.agnes-ai.com/v1" },
  ainative: { name: "AINative Studio", baseUrl: "https://api.ainative.studio/api/v1" },
  aion: { name: "Aion Labs", baseUrl: "https://api.aionlabs.ai/v1" },
  bazaarlink: { name: "BazaarLink", baseUrl: "https://bazaarlink.ai/api/v1" },
  freeinference: { name: "FreeInference", baseUrl: "https://freeinference.org/v1" },
  llmtr: { name: "LLMTR", baseUrl: "https://llmtr.com/v1" },
  xfyun: { name: "iFlytek Spark", baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  zai: { name: "Z.ai (global)", baseUrl: "https://api.z.ai/api/paas/v4" },
}

const LIST_TIMEOUT_MS = 8000

// lastGoodModels[providerId] is the model table last read from that gateway, so
// a gateway that is down or slow yields the previous list (never an empty one).
const lastGoodModels = new Map()

// ICON is one shared mark (data URI) so every provider card has an icon with no
// network fetch. iconOf() accepts https:// and data:image/ URIs.
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="#0b1220"/>' +
      '<path d="M20 18h26v7H27v7h15v7H27v13h-7z" fill="#38e07b"/>' +
      "</svg>",
  )

function deadline(signal, ms) {
  const t =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ms)
      : undefined
  if (signal && t && typeof AbortSignal.any === "function") {
    try {
      return AbortSignal.any([signal, t])
    } catch {
      return signal
    }
  }
  return signal || t
}

// makeProvider builds the magpie OpenCode-v1 plugin function for one catalog
// entry. baseOverride lets a test (or a self-hosted mirror) point it elsewhere.
export function makeProvider(entry, baseOverride) {
  const base = String(baseOverride || entry.baseUrl).replace(/\/+$/, "")
  const id = entry.id ?? entry.__id
  const name = entry.name
  const keyless = entry.keyless === true

  return async (input, options) => ({
    // declare the provider up front so magpie shows the card before sign-in
    config: async (cfg) => {
      cfg.provider = cfg.provider ?? {}
      cfg.provider[id] = cfg.provider[id] ?? {
        name,
        npm: "@ai-sdk/openai-compatible",
        api: base,
        models: {},
      }
    },

    auth: {
      provider: id,
      icon: ICON,
      methods: [
        keyless
          ? {
              type: "api",
              label: `${name} (no key needed)`,
              keyless: true,
              authorize: async () => ({ type: "success", key: "public" }),
            }
          : { type: "api", label: `${name} API key`, placeholder: "paste the key from this provider's console" },
      ],
      loader: async (getAuth) => {
        const a = await getAuth()
        return {
          baseURL: base,
          apiKey: a?.key ?? "",
          async fetch(url, init) {
            const auth = await getAuth()
            const headers = new Headers(init?.headers)
            if (auth?.key) headers.set("authorization", "Bearer " + auth.key)
            return fetch(url, { ...(init ?? {}), headers })
          },
        }
      },
    },

    provider: {
      id,
      models: async (p, { auth, signal } = {}) => {
        const models = p?.models ?? {}
        const key = auth?.key ?? ""
        // don't hit a vendor before it is signed in: keeps a page full of
        // un-signed providers fast and quiet
        if (!key && !keyless) return models
        const headers = { accept: "application/json" }
        if (key) headers.authorization = "Bearer " + key
        try {
          const res = await fetch(base + "/models", {
            headers,
            signal: deadline(signal, LIST_TIMEOUT_MS),
          })
          if (!res.ok) throw new Error(`${name} answered ${res.status} for GET /models`)
          const data = await res.json()
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
          for (const m of list) {
            const mid = typeof m?.id === "string" ? m.id.trim() : ""
            if (!mid) continue
            if (m?.available === false) continue
            const ctx = Number(m?.context_window ?? m?.context_length ?? m?.limit?.context ?? 0) || 0
            const out = Number(m?.max_output_tokens ?? m?.limit?.output ?? 0) || 0
            const e = { name: m?.name || m?.display_name || mid, free: true }
            if (ctx || out) {
              e.limit = {}
              if (ctx) e.limit.context = ctx
              if (out) e.limit.output = out
            }
            models[mid] = e
          }
          lastGoodModels.set(id, { ...models })
          return models
        } catch {
          const cached = lastGoodModels.get(id)
          if (cached && Object.keys(cached).length) return cached
          return models
        }
      },
    },
  })
}
