// Free-provider hub for magpie — the useful part of FreeLLMAPI, brought into
// magpie natively (no separate freellmapi server to run).
//
// Each entry is an OpenAI-compatible free LLM gateway. The plugin exposes every
// one as its own magpie provider: you add that gateway's key once in magpie,
// magpie lists its models, and routing groups give failover across them.
//
// `baseUrl` and `keysUrl` are taken from FreeLLMAPI's own registry
// (server/src/providers/ for baseUrl, client/src/components/keys/shared.tsx for
// keysUrl). To add or drop a gateway, edit this catalog.

export const catalog = {
  // ---- major / well-known free tiers ----
  cerebras: { name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", keysUrl: "https://cloud.cerebras.ai" },
  huggingface: { name: "HuggingFace Router", baseUrl: "https://router.huggingface.co/v1", keysUrl: "https://huggingface.co/settings/tokens" },
  cohere: { name: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1", keysUrl: "https://dashboard.cohere.com/api-keys" },
  opencode: { name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1", keysUrl: "https://opencode.ai/auth" },
  kilo: { name: "Kilo Gateway", baseUrl: "https://api.kilo.ai/api/gateway/v1", keysUrl: "https://app.kilo.ai", keyless: true },
  ovh: { name: "OVH AI Endpoints", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", keysUrl: "https://endpoints.ai.cloud.ovh.net", keyless: true },
  reka: { name: "Reka", baseUrl: "https://api.reka.ai/v1", keysUrl: "https://platform.reka.ai" },
  requesty: { name: "Requesty", baseUrl: "https://router.requesty.ai/v1", keysUrl: "https://www.requesty.ai" },
  routeway: { name: "Routeway", baseUrl: "https://api.routeway.ai/v1", keysUrl: "https://routeway.ai" },
  llm7: { name: "LLM7", baseUrl: "https://api.llm7.io/v1", keysUrl: "https://llm7.io", keyless: true },
  pollinations: { name: "Pollinations", baseUrl: "https://gen.pollinations.ai/v1", keysUrl: "https://enter.pollinations.ai" },

  // ---- free-grant / shared-quota gateways ----
  iteracompute: { name: "IteraCompute", baseUrl: "https://api.iteracompute.com/v1", keysUrl: "https://iteracompute.com/free/" },
  xkiro: { name: "xKiro", baseUrl: "https://api.xkiro.com/v1", keysUrl: "https://xkiro.com" },
  navy: { name: "NavyAI", baseUrl: "https://api.navy/v1", keysUrl: "https://api.navy" },
  nara: { name: "NaraRouter", baseUrl: "https://router.bynara.id/v1", keysUrl: "https://router.bynara.id" },
  sealion: { name: "SEA-LION", baseUrl: "https://api.sea-lion.ai/v1", keysUrl: "https://sea-lion.ai" },
  orcarouter: { name: "OrcaRouter", baseUrl: "https://api.orcarouter.ai/v1", keysUrl: "https://www.orcarouter.ai" },
  unorouter: { name: "UnoRouter", baseUrl: "https://api.unorouter.com/v1", keysUrl: "https://unorouter.com" },
  bai: { name: "B.AI", baseUrl: "https://api.b.ai/v1", keysUrl: "https://b.ai" },
  agnes: { name: "Agnes AI", baseUrl: "https://apihub.agnes-ai.com/v1", keysUrl: "https://platform.agnes-ai.com" },
  ainative: { name: "AINative Studio", baseUrl: "https://api.ainative.studio/api/v1", keysUrl: "https://ainative.studio" },
  aion: { name: "Aion Labs", baseUrl: "https://api.aionlabs.ai/v1", keysUrl: "https://www.aionlabs.ai" },
  bazaarlink: { name: "BazaarLink", baseUrl: "https://bazaarlink.ai/api/v1", keysUrl: "https://bazaarlink.ai" },
  freeinference: { name: "FreeInference", baseUrl: "https://freeinference.org/v1", keysUrl: "https://freeinference.org" },
  llmtr: { name: "LLMTR", baseUrl: "https://llmtr.com/v1", keysUrl: "https://llmtr.com" },
  xfyun: { name: "iFlytek Spark", baseUrl: "https://spark-api-open.xf-yun.com/v1", keysUrl: "https://console.xfyun.cn" },
  zai: { name: "Z.ai (global)", baseUrl: "https://api.z.ai/api/paas/v4", keysUrl: "https://z.ai/manage-apikey/apikey-list" },
}

const LIST_TIMEOUT_MS = 8000

// lastGoodModels[providerId] is the model table last read from that gateway, so
// a gateway that is down or slow yields the previous list (never an empty one).
const lastGoodModels = new Map()

// ICON is one shared mark (data URI) so every provider card has an icon with no
// network fetch.
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
  const keysUrl = entry.keysUrl || ""

  return async (input, options) => ({
    // declare the provider up front so magpie shows its card before sign-in
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
      methods: keyless
        ? [
            {
              type: "api",
              label: `${name} (无需 key)`,
              keyless: true,
              authorize: async () => ({ type: "success", key: "public" }),
            },
          ]
        : [
            {
              // A browser sign-in whose "code" step takes the API key: magpie
              // shows the keys page (a link the user can click / copy), and the
              // pasted value is saved as this provider's api key.
              type: "oauth",
              label: `${name}：打开申请页 / 粘贴 Key`,
              authorize: async () =>
                keysUrl
                  ? {
                      url: keysUrl,
                      instructions: `在打开的 ${name} 页面创建并复制 API key，粘贴到下面的输入框，再点 Finish sign-in。`,
                      method: "code",
                      callback: async (code) => {
                        const k = String(code ?? "").trim()
                        return k ? { type: "success", key: k } : { type: "failed", error: "请先粘贴 API key" }
                      },
                    }
                  : { type: "failed", error: `${name} has no keys page set` },
            },
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
