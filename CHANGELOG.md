# Changelog

## 0.2.0

- **重做：插件自带免费渠道，不再依赖单独运行 freellmapi 服务。** 把 FreeLLMAPI 聚合的免费网关（baseUrl 取自其源码 `server/src/providers/`）做成 magpie 的**一批原生 provider**：每个渠道各自填 key，magpie 原生列模型，可用路由组在这些渠道间做失败切换。
- 新增渠道目录 `lib.mjs`（27 个 OpenAI 兼容免费网关）+ 工厂 `makeProvider`；`index.js` 每个渠道导出为一个 provider。增删渠道只需改 `lib.mjs` 和 `index.js` 的一行导出。
- 未填 key 的渠道不再触网（列表快速、干净）；模型读取带超时、失败回退上次成功列表、从不抛错（延续 0.1.1 的稳定性修复）。
- 保留「免费渠道参考页」，网址为可复制文本（magpie 沙箱禁止跳转外链）。

## 0.1.2

- **登录后直接接管 FreeLLMAPI 的模型调用。** 模型列表改为读 `GET /v1/models?available=true`，只把 FreeLLMAPI **当前真能服务**的模型接入 magpie；同时天然带上 FreeLLMAPI 的路由模型：
  - `auto` —— 让 FreeLLMAPI 自动挑最合适的可用模型（带失败切换），agent 里选 `freellmapi/auto` 即可把选模型交给它；
  - `fusion` —— 多模型并行作答 + judge 合成；
  - `auto:<链名>` —— 你在 FreeLLMAPI 里定义的命名 fallback 链。
  这些都通过**统一 key**（Bearer）访问，magpie 侧无需再手动维护模型清单。
- 对不识别 `?available=true` 的旧版网关，客户端再过滤一次 `available === false` 的行；并保证 `auto` 一定出现在列表里。
- 网关慢/未启动时仍旧回退到上次成功的列表、不抛错（0.1.1 的行为保留）。

## 0.1.1

- **Fix: 任务不再因网关抖动而中断。** `provider.models` 现在绝不抛错：读取 `/v1/models` 带超时并跟随 magpie 的取消信号；失败时回退到上一次成功拉到的模型列表（无缓存时安静返回空），所以已配置的模型不会突然“消失”，正在进行的 agent 任务也不会因此被打断。
- **Fix: 参考页链接不可跳转。** magpie 插件页运行在 `sandbox allow-scripts` 的离屏 iframe 里（`connect-src 'none'`、无弹窗/导航权限），无法打开外部链接。已把页面里的网址改为「点选即全选、可复制」的文本，并加提示：复制到浏览器打开。
- `auth.usage` 的 `/v1/usage` 读取也加了超时与错误兜底。

## 0.1.0

- 首个版本：FreeLLMAPI 作为 magpie provider 插件接入；统一 key 登录、`/v1/models` 动态发现（全部标记 free）、Bearer 转发、`/v1/usage` 用量展示、免费渠道参考页。
