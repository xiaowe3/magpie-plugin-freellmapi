# magpie-plugin-freellmapi

把 [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) 接进 [magpie](https://github.com/yetone/magpie) 的 **provider 插件**。

FreeLLMAPI 在本地起一个 OpenAI 兼容网关（默认 `http://localhost:3001/v1`），把 ~34 家免费 LLM 供应商的额度聚合到**一个统一 key** 后面。装上本插件后，FreeLLMAPI 里已配置的所有模型会出现在 magpie 的模型选择器里，任何 agent 都能直接用，且全部标记为「免费」，可配合 magpie 的 `FreeFirst` 路由策略。

## 特性

- **一键登录**：在 magpie 里粘贴 FreeLLMAPI 的**统一 key**（`freellmapi-…`），无需手改配置文件。
- **登录后直接接管模型调用**：自动接入 FreeLLMAPI **当前可服务**的模型；并带上它的路由模型——`auto`（FreeLLMAPI 自动挑最佳可用模型、自动失败切换）、`fusion`（多模型合成）、`auto:<链名>`（命名 fallback 链）。在 agent 里选 `freellmapi/auto`，就等于把「选模型 + 容错」交给 FreeLLMAPI，全部走统一 key。
- **动态模型发现**：每次刷新读 `GET /v1/models?available=true`，FreeLLMAPI 里新增/失效的供应商与模型会自动反映。
- **请求转发**：自动带上 `Authorization: Bearer <统一 key>`，转发到本地网关。
- **免费标记**：发现的模型都设为 `free: true`，便于路由优先使用。
- **用量可视**：读取 FreeLLMAPI 的 `/v1/usage`，在 magpie 用量页显示本月各平台/总计消耗的 token 与请求数。
- **附带参考页**：magpie 界面里多一个「FreeLLMAPI 免费渠道」页，随时查各供应商的领取入口。

## 安装

需要 magpie 已安装（它自带 Bun 运行插件）。

**从 GitHub 安装（推荐）：**

```bash
# 直接让 magpie 从 git 仓库拉取并安装
magpie plugin add https://github.com/<你的用户名>/magpie-plugin-freellmapi

# 或者先 clone 再按文件夹安装（便于改代码后 off/on 重载）
git clone https://github.com/<你的用户名>/magpie-plugin-freellmapi.git
magpie plugin add ./magpie-plugin-freellmapi
```

装好后在 magpie 的 **Settings → Plugins** 里确认已 On。更新：`magpie plugin update magpie-plugin-freellmapi`。

**从本地文件夹安装（开发/自用）：**

```bash
# 在 magpie-plugin-freellmapi 的上级目录执行
magpie plugin add ./magpie-plugin-freellmapi
```

之后在 magpie 的 **Settings → Plugins** 里确认它已 On；改代码后 off/on 或 `magpie plugin update` 重载。

**从 npm（若已发布）：**

```bash
magpie plugin add magpie-plugin-freellmapi
```

也可以直接在 magpie 的 **Plugins → Add a plugin** 里填本地路径或包名。

## 配置

### 1. 指定 FreeLLMAPI 的地址（可选）

默认 `http://localhost:3001`。如果你的 FreeLLMAPI 跑在别的端口/主机：

**Settings → Plugins → 本插件 → Options**，填 JSON：

```json
{ "baseUrl": "http://localhost:3001" }
```

（`baseUrl` 带不带 `/v1` 都行，插件会自动补成 `…/v1`。）

### 2. 登录

**Providers → Add provider → FreeLLMAPI → 填统一 key**：

1. 打开 FreeLLMAPI 面板（默认 `http://localhost:3001`）；
2. 在 Keys 页把各供应商的免费 key 填好；
3. 在 Keys 页头点「生成统一 key」，复制 `freellmapi-xxxx…`；
4. 回到 magpie，把它粘进 FreeLLMAPI provider 的 key 框。

## 它做什么 / 不做什么

| | |
|---|---|
| 鉴权 | 用 FreeLLMAPI 的**统一 key**，走 `Authorization: Bearer` |
| 模型 | 从 `GET /v1/models` 动态读取，全部标记 free |
| 请求 | 转发到 `http://localhost:3001/v1/chat/completions` 等 |
| 用量 | 读 `/v1/usage`，在 magpie Usage 页按月显示各平台消耗（仅统一 key 可读） |
| 协议 | `@ai-sdk/openai-compatible`（Chat Completions） |

插件只负责「把 FreeLLMAPI 这个本地网关当成一个供应商接进来」。各免费供应商的**路由、限流、降级、按 key 记账**仍由 FreeLLMAPI 自己完成。

## 不想装插件？也有一条零插件路径

magpie 原生支持自定义 OpenAI 兼容供应商，可以完全不写插件：

```bash
magpie provider add "freellmapi" url=http://localhost:3001/v1 key=freellmapi-xxxx
magpie provider models freellmapi   # 拉取模型列表检查
```

代价是模型列表要手动维护。插件版本的价值就是**动态发现 + 免费标记 + 参考页**。

## 目录结构

```
magpie-plugin-freellmapi/
├── package.json          # name/main/exports + magpie.options + magpie.page
├── index.js              # provider 插件：config / auth / provider.models
├── page/
│   ├── freellmapi.html   # 免费渠道参考页（静态，沙箱内渲染）
│   └── icon.svg          # 页面图标
├── test/
│   └── smoke.mjs         # 对一个 mock 网关跑通 config/loader/models/fetch
└── README.md
```

## 本地验证插件

不需要真跑 magpie，用 Node 就能对 hooks 做冒烟测试（会起一个 mock 的 FreeLLMAPI 网关）：

```bash
cd magpie-plugin-freellmapi
node test/smoke.mjs
```

## 插件契约（给维护者）

按 magpie 的 OpenCode-v1 provider 插件契约实现，入口：

```js
export const FreeLLMAPI = async (input, options) => ({
  config,          // 声明 provider：name / npm / api / models
  auth: {          // 登录方式 + loader
    provider: "freellmapi",
    methods: [{ type: "api", label, placeholder }],
    loader: async (getAuth) => ({ baseURL, apiKey, fetch(url, init) }),
  },
  provider: {      // 模型发现
    id: "freellmapi",
    models: async (p, { auth }) => ({ ... }),
  },
})
```

参考：magpie 仓库 `docs/subsystems/provider-plugins.md` 与 `internal/plugin/host.js`。

## 排错 / 已知行为

- **参考页里的网址点不了（不能跳转）**：这是 magpie 的安全设计——插件页运行在 `sandbox allow-scripts` 的离屏 iframe 里（`connect-src 'none'`，且没有弹窗/顶层导航权限），页面无法打开任何外部链接。因此本页把网址做成了「点一下即全选、可复制」的文本：**选中 → 复制 → 粘到浏览器**打开即可。
- **在 magpie 里跑任务被中断 / 模型消失**：0.1.1 起已修复——`provider.models` 不再抛错，`/v1/models` 带超时并跟随 magpie 的取消信号；网关慢或暂时停掉时回退到上一次成功拉到的模型列表，不会让已配置的模型突然消失而打断正在进行的任务。
  - 若仍中断：先确认 FreeLLMAPI 正在运行（`http://localhost:3001` 能打开），并在 log 里看是不是模型返回了 429/上游错误；再 `magpie plugin update magpie-plugin-freellmapi` 或 off/on 重载插件。把 magpie 里该 provider 的具体报错发我即可继续定位。
- **`/v1/usage` 显示错误**：用量只对 **统一 key**（`freellmapi-…`）开放；用 client-profile key（`sk-cp-…`）会 403，属正常。

## 许可证

MIT。
