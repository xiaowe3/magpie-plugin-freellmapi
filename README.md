# magpie-plugin-freellmapi

把 [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) 聚合的那些**免费 LLM 网关**，直接搬成 [magpie](https://github.com/yetone/magpie) 的**原生 provider**——**不需要再单独跑一个 freellmapi 服务**。

装一次插件后，magpie 的 Providers 里会多出这批免费渠道；你给要用的一两家**填上各自的 key**，magpie 就会列出它们的模型，并可用 `路由组`/Smart 路由在多渠道间做失败切换——这正是 freellmapi 那个「聚合 + 容错」做的事，只是现在由 magpie 自己完成。

## 与旧版（0.1.x）的区别

- 0.1.x：插件只是**客户端**，去连你本机另跑的 `freellmapi` 服务（`http://localhost:3001`）。
- 0.2.x（本版）：**插件自带渠道**。每个免费网关就是一个独立的 magpie provider，各自填 key，无需 freellmapi 服务。

## 安装

```powershell
magpie plugin add github:xiaowe3/magpie-plugin-freellmapi
# 或先 clone 再按文件夹装
# magpie plugin add "C:\path\to\magpie-plugin-freellmapi"
```

装好后 **Settings → Plugins** 确认已 On。

## 使用（三步）

1. **Providers** 里会新增一批免费渠道（见下方清单），挑你要用的那个，点进去填它自己的 API key（去该渠道的控制台申请）。
   - 无 key 时不会去访问它（列表保持干净、快速）；填了 key 才会拉模型。
2. 该渠道的模型会自动出现在 magpie 的模型选择器里（读它自己的 `GET /v1/models`）。
3. 想把「一个模型在多家之间自动切换」做成 freellmapi 那样的容错：在 magpie 里建一个**路由组**，把多家提供同名/同类模型的渠道放进去（或直接用 Smart 路由）。某个渠道限流/失败时 magpie 会换下一个。

> 说明：没有一个「统一 key 走所有渠道」的入口了——那需要一个聚合服务；本版是 magpie 原生多 provider。各家 key 存在 magpie 自己的 provider 存储里（`providers.json`，0600）。

## 内置渠道清单（可在 `lib.mjs` 增删）

来自 FreeLLMAPI 源码 `server/src/providers/` 的权威 baseUrl：

Cerebras、HuggingFace Router、Cohere、OpenCode Zen、Kilo Gateway、OVH AI Endpoints、Reka、Requesty、Routeway、LLM7（免 key）、Pollinations（免 key）、IteraCompute、xKiro、NavyAI、NaraRouter、SEA-LION、OrcaRouter、UnoRouter、B.AI、Agnes AI、AINative Studio、Aion Labs、BazaarLink、FreeInference、LLMTR、iFlytek Spark、Z.ai（global）。

（Groq / Mistral / NVIDIA / OpenRouter / SiliconFlow / ModelScope / 智谱 GLM / 千帆 / 火山 / LongCat 等 magpie 已内置预设，这里不重复；直接用 magpie 自带预设即可。）

## 增删渠道

- 在 [lib.mjs](lib.mjs) 的 `catalog` 里加一行 `{ name, baseUrl, keyless? }`；
- 在 [index.js](index.js) 末尾加一行同名导出：`export const 你的id = makeProvider(withId("你的id"))`；
- 重新安装/更新插件并 off→on 重载。

只要该渠道是 **OpenAI 兼容**（`/v1/chat/completions` + `/v1/models`，Bearer 鉴权）即可。

## 免费渠道领取入口（参考页）

magpie 界面里带一个「FreeLLMAPI 免费渠道」页，列了各家的领取入口。注意：**插件页运行在沙箱里，不能直接打开外部链接**，所以网址是可点选复制的文本——**选中 → 复制 → 粘到浏览器**打开。

## 排错

- **某渠道没有模型**：多半是它没暴露 `GET /v1/models`，或 key 不对（会 401）。先在浏览器/curl 验证 `GET {baseUrl}/models` 带 `Authorization: Bearer <key>` 是否返回模型列表。
- **任务中断**：本插件各渠道的模型读取带超时、失败回退到上次成功的列表、从不抛错；未填 key 的渠道完全不触网。若仍中断，把 magpie 里该 provider 的报错发我。
- **渠道可用性/额度**：这些多为免费/共享额度，变动快；以各家控制台为准。

## 许可证

MIT。
