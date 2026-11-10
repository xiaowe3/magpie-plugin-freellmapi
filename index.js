// magpie provider plugin for FreeLLMAPI
// ---------------------------------------------------------------------------
// FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi) runs a local
// OpenAI-compatible gateway (default http://localhost:3001/v1) that aggregates
// ~34 free LLM providers behind ONE unified key (freellmapi-<48 hex>).
//
// This plugin exposes that gateway to magpie as the provider "freellmapi":
//   - one "api key" sign-in: paste the unified key from the FreeLLMAPI dashboard
//   - models are discovered live from GET /v1/models, so providers/keys you add
//     in FreeLLMAPI show up in magpie on the next refresh
//   - requests are forwarded to the local gateway with a Bearer header
//   - every discovered model is marked free, so magpie's FreeFirst routing can
//     prefer it
//
// Base URL is configurable through the plugin's package options (Plugins page
// -> Options JSON): { "baseUrl": "http://localhost:3001" }
//
// Written against magpie's OpenCode-v1 provider-plugin contract:
//   export const X = async (input, options) => ({ config, auth, provider, ... })
// See docs/subsystems/provider-plugins.md in the magpie repo.

const PROVIDER_ID = "freellmapi"

// ICON is an inline SVG (data URI) so the provider card has a mark without any
// network fetch. iconOf() accepts https:// and data:image/ URIs.
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="#0b1220"/>' +
      '<path d="M20 18h26v7H27v7h15v7H27v13h-7z" fill="#38e07b"/>' +
      "</svg>",
  )

// apiBase normalises the configured base URL to end in /v1.
// "http://localhost:3001" and "http://localhost:3001/" both become
// "http://localhost:3001/v1"; a value already ending in /v1 is kept.
function apiBase(options) {
  let base =
    typeof options?.baseUrl === "string" && options.baseUrl.trim()
      ? options.baseUrl.trim()
      : "http://localhost:3001"
  base = base.replace(/\/+$/, "")
  if (!/\/v1$/.test(base)) base += "/v1"
  return base
}

export const FreeLLMAPI = async (input, options) => {
  const base = apiBase(options)

  return {
    // config declares the provider up front (name, protocol, base) so magpie
    // shows a FreeLLMAPI card even before it lists models. An entry the user
    // already saved by hand is never overwritten.
    config: async (cfg) => {
      cfg.provider = cfg.provider ?? {}
      cfg.provider[PROVIDER_ID] = cfg.provider[PROVIDER_ID] ?? {
        name: "FreeLLMAPI",
        npm: "@ai-sdk/openai-compatible",
        api: base,
        models: {},
      }
    },

    auth: {
      provider: PROVIDER_ID,
      icon: ICON,
      methods: [
        {
          type: "api",
          label: "FreeLLMAPI unified key",
          placeholder: "freellmapi-…",
        },
      ],
      // loader runs once per signed-in account. It hands magpie the base URL
      // and a fetch that adds the Bearer header to every request the gateway
      // routes to this provider.
      loader: async (getAuth) => {
        const a = await getAuth()
        return {
          baseURL: base,
          apiKey: a?.type === "api" && typeof a.key === "string" ? a.key : "",
          async fetch(url, init) {
            const auth = await getAuth()
            const headers = new Headers(init?.headers)
            if (auth?.type === "api" && auth.key) {
              headers.set("authorization", "Bearer " + auth.key)
            }
            // the host strips its own x-magpie-* headers from what a plugin
            // sends; nothing extra to do here.
            return fetch(url, { ...init, headers })
          },
        }
      },

      // usage reads GET /v1/usage (unified key only): the month-to-date spend
      // per provider platform, shown on magpie's Usage page. It reports counts,
      // not a share of a cap, so each window is display-only (aside: true) and
      // never steers routing.
      usage: async (getAuth) => {
        const a = await getAuth()
        if (a?.type !== "api" || !a.key) {
          return { error: "add a FreeLLMAPI unified key to see usage" }
        }
        const fmt = (n) => {
          const x = Number(n) || 0
          if (x >= 1e6) return (x / 1e6).toFixed(1) + "M"
          if (x >= 1e3) return (x / 1e3).toFixed(1) + "K"
          return String(x)
        }
        try {
          const r = await fetch(base + "/usage", {
            headers: { accept: "application/json", authorization: "Bearer " + a.key },
          })
          if (r.status === 403) {
            return { error: "usage needs the unified key — client-profile keys can't read it" }
          }
          if (!r.ok) {
            return {
              error: `FreeLLMAPI answered ${r.status} for GET /v1/usage`,
              ...(r.status === 401 ? { signIn: "expired" } : {}),
            }
          }
          const u = await r.json()
          const windows = [
            {
              name: "All providers",
              display: `${fmt(u.tokens)} tokens · ${u.requests ?? 0} req`,
              aside: true,
              resetsAt: u.resetsAt,
            },
          ]
          for (const p of Array.isArray(u.byPlatform) ? u.byPlatform : []) {
            windows.push({
              name: p?.platform || "unknown",
              display: `${fmt(p?.tokens)} tokens · ${p?.requests ?? 0} req`,
              aside: true,
              resetsAt: u.resetsAt,
            })
          }
          return {
            plan: "FreeLLMAPI" + (u.month ? " · " + u.month : ""),
            until: u.resetsAt,
            renew: "auto",
            windows,
          }
        } catch (e) {
          return { error: `could not read FreeLLMAPI usage: ${e?.message ?? e}` }
        }
      },
    },

    provider: {
      id: PROVIDER_ID,
      // models runs for the account's model list. It asks the gateway's
      // /v1/models and maps the OpenAI-shaped answer into magpie's model
      // table, marking every model free. A failure keeps the last list (magpie
      // does that), so it throws only when an account is signed in.
      models: async (p, { auth }) => {
        const models = { ...(p?.models ?? {}) }
        const key = auth?.type === "api" && typeof auth.key === "string" ? auth.key : ""
        const signedIn = !!key

        try {
          const headers = { accept: "application/json" }
          if (key) headers.authorization = "Bearer " + key
          const res = await fetch(base + "/models", { headers })
          if (!res.ok) {
            throw new Error(`FreeLLMAPI answered ${res.status} for GET /v1/models`)
          }
          const data = await res.json()
          const list = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : []
          for (const m of list) {
            const id = typeof m?.id === "string" ? m.id.trim() : ""
            if (!id) continue
            const ctx =
              Number(m?.context_length ?? m?.context_window ?? m?.limit?.context ?? 0) || 0
            const out =
              Number(m?.max_output_tokens ?? m?.limit?.output ?? 0) || 0
            const entry = {
              name: m?.name || m?.display_name || id,
              free: true,
            }
            if (ctx || out) {
              entry.limit = {}
              if (ctx) entry.limit.context = ctx
              if (out) entry.limit.output = out
            }
            models[id] = entry
          }
          return models
        } catch (e) {
          // Not signed in: nothing to show, don't alarm. Signed in: let magpie
          // surface the error and keep whatever list it had.
          if (signedIn) {
            throw new Error(`could not list FreeLLMAPI models: ${e?.message ?? e}`)
          }
          return models
        }
      },
    },
  }
}

export default FreeLLMAPI
