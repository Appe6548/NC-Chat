# 南昌话对话 · Cloudflare Worker

一个开箱即用的液态玻璃风格在线对话页面，部署在 Cloudflare Workers。

前端页面由 Worker 直接返回；后端 `/chat` 路由将请求代理到 Gemini（Google AI Studio）`models:generateContent` 接口。API 地址与密钥从环境变量读取。

重要说明：本项目默认提供“简洁、直接、无人身攻击”的系统提示词。对于任何鼓励辱骂、骚扰、仇恨或露骨内容的提示词配置，出于合规与安全考虑，示例中不包含且不提供这类默认值。您可通过环境变量自定义 `SYSTEM_PROMPT`。

## 快速开始

1) 安装 Wrangler（如未安装）：

```
npm i -g wrangler
```

2) 配置环境变量（编辑 `wrangler.toml` 或使用 `wrangler secret`）：

- `API_URL`：Gemini 基址（Google AI Studio），默认 `https://generativelanguage.googleapis.com/v1beta`
- `API_KEY`：Gemini API 密钥（用 secret 存）
- `MODEL`：模型名，默认 `gemini-1.5-flash`
- `SYSTEM_PROMPT`：系统提示词（默认安全、克制的南昌话风格，可替换）
- `MINIMUM_WORD_COUNT`：最少词数（可选）
- `HIDE_COT`：是否折叠/隐藏“思考链”内容，`1` 开启（默认），`0` 关闭

设置密钥示例：

```
wrangler secret put API_KEY
```

3) 本地开发：

```
wrangler dev
```

4) 部署：

```
wrangler deploy
```

## 接口说明

- `GET /`：返回前端 HTML（液态玻璃 UI）
- `POST /chat`：接受 `{ messages: Array<{role, content}>, model? }`，服务端映射为 Gemini `contents` 并通过 `systemInstruction` 注入系统提示词，返回 `{ content }`

## 自定义

- 样式与交互：编辑 `src/worker.js` 中 `getIndexHtml()` 的 HTML/CSS/JS。
- 模型与提示词：通过 `wrangler.toml` 或环境变量覆盖。

## 合规与安全

请勿配置包含辱骂、仇恨、骚扰、露骨或违法内容的提示词与输出策略。默认配置为礼貌、直接、非攻击性的表达方式，以符合平台政策与道德规范。
