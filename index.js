// magpie plugin: free-provider hub (ported from FreeLLMAPI's provider registry).
//
// Every `export const` below becomes its own magpie provider (one shared plugin
// package). Install this plugin once, then in magpie add a key for whichever
// free gateways you use — each is listed with its own models, and magpie can
// route/fail over across them via routing groups. No separate freellmapi
// server needs to run.
//
// To add or remove a gateway, edit lib.mjs (the catalog) and add/remove one
// export line below.

import { catalog, makeProvider } from "./lib.mjs"

const withId = (id) => ({ ...catalog[id], __id: id })

export const cerebras = makeProvider(withId("cerebras"))
export const huggingface = makeProvider(withId("huggingface"))
export const cohere = makeProvider(withId("cohere"))
export const opencode = makeProvider(withId("opencode"))
export const kilo = makeProvider(withId("kilo"))
export const ovh = makeProvider(withId("ovh"))
export const reka = makeProvider(withId("reka"))
export const requesty = makeProvider(withId("requesty"))
export const routeway = makeProvider(withId("routeway"))
export const llm7 = makeProvider(withId("llm7"))
export const pollinations = makeProvider(withId("pollinations"))
export const iteracompute = makeProvider(withId("iteracompute"))
export const xkiro = makeProvider(withId("xkiro"))
export const navy = makeProvider(withId("navy"))
export const nara = makeProvider(withId("nara"))
export const sealion = makeProvider(withId("sealion"))
export const orcarouter = makeProvider(withId("orcarouter"))
export const unorouter = makeProvider(withId("unorouter"))
export const bai = makeProvider(withId("bai"))
export const agnes = makeProvider(withId("agnes"))
export const ainative = makeProvider(withId("ainative"))
export const aion = makeProvider(withId("aion"))
export const bazaarlink = makeProvider(withId("bazaarlink"))
export const freeinference = makeProvider(withId("freeinference"))
export const llmtr = makeProvider(withId("llmtr"))
export const xfyun = makeProvider(withId("xfyun"))
export const zai = makeProvider(withId("zai"))
