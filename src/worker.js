export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Simple router
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getIndexHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (request.method === 'GET' && url.pathname === '/robots.txt') {
      return new Response("User-agent: *\nDisallow:", { headers: { 'content-type': 'text/plain' } });
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      return this.handleChat(request, env);
    }

    return new Response('Not found', { status: 404 });
  },

  async handleChat(request, env) {
    try {
      const body = await request.json();
      const userMessages = Array.isArray(body?.messages) ? body.messages : [];
      const model = body?.model || env.MODEL || 'gemini-1.5-flash';

      const apiBase = (env.API_URL || '').replace(/\/$/, '');
      if (!apiBase) return json({ error: 'Missing API_URL' }, 400);

      const apiKey = env.API_KEY;
      if (!apiKey) return json({ error: 'Missing API_KEY' }, 400);

      const sysPrompt = env.SYSTEM_PROMPT && String(env.SYSTEM_PROMPT).trim()
        ? String(env.SYSTEM_PROMPT).trim()
        : '用南昌话，直截了当，冷幽默，避免粗俗和人身攻击，回答尽量简短到点，不讲故事。';

      const minimumWordCount = Number(env.MINIMUM_WORD_COUNT || 0) || 0;

      // Map to Gemini contents
      const contents = userMessages
        .filter(m => m && typeof m.content === 'string' && m.content.trim().length)
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content) }],
        }));

      const systemText = `${sysPrompt}${minimumWordCount ? `（不少于 ${minimumWordCount} 个词。）` : ''}`;

      const endpoint = `${apiBase}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const upstreamRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
        }),
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        return json({ error: 'Upstream error', status: upstreamRes.status, details: errText }, 502);
      }

      const data = await upstreamRes.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p?.text || '').join('');
      return json({ content: text });
    } catch (e) {
      return json({ error: 'Bad request', details: String(e && e.message || e) }, 400);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getIndexHtml() {
  // Single-file UI with liquid glass styling
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>南昌话对话 · Cloudflare Worker</title>
  <style>
    :root{
      --bg: #0b0f14;
      --glass: rgba(255,255,255,0.08);
      --glass-2: rgba(255,255,255,0.12);
      --txt: #e8eef8;
      --muted: #9fb3c8;
      --brand: #7cc7ff;
      --accent: #8be9fd;
      --shadow: 0 10px 30px rgba(0,0,0,0.35);
      --radius: 16px;
    }
    *{ box-sizing: border-box; }
    html,body{ height:100%; }
    body{
      margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, PingFang SC, Noto Sans, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      color:var(--txt);
      background: radial-gradient(1200px 800px at 10% -10%, rgba(124,199,255,0.18), transparent 60%),
                  radial-gradient(900px 700px at 90% 110%, rgba(139,233,253,0.14), transparent 60%),
                  linear-gradient(180deg, #0b0f14, #0a0e12);
      display:grid; place-items:center;
    }
    .app{
      width:min(980px, 92vw);
      height:min(720px, 90vh);
      display:flex; flex-direction:column;
      gap:12px;
    }
    .glass{
      background: var(--glass);
      border: 1px solid rgba(255,255,255,0.12);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    header{
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 16px; gap:12px;
    }
    header .title{ font-weight:700; letter-spacing:0.3px; }
    header .right{ display:flex; gap:8px; align-items:center; color:var(--muted); font-size:12px; }
    .chat{
      flex:1; display:flex; flex-direction:column; overflow:hidden;
    }
    .messages{
      flex:1; overflow:auto; padding:18px; display:flex; flex-direction:column; gap:12px;
      scroll-behavior:smooth;
    }
    .msg{ padding:12px 14px; border-radius:12px; max-width:85%; white-space:pre-wrap; line-height:1.5; }
    .msg.user{ align-self:flex-end; background: linear-gradient(180deg, var(--glass-2), rgba(255,255,255,0.06)); border:1px solid rgba(255,255,255,0.14); }
    .msg.assistant{ align-self:flex-start; background: rgba(8,15,24,0.6); border:1px solid rgba(255,255,255,0.1); }
    .bar{
      display:flex; gap:10px; padding:12px; align-items:flex-end; border-top:1px solid rgba(255,255,255,0.08);
    }
    textarea{
      flex:1; resize:none; min-height:42px; max-height:160px; background: rgba(255,255,255,0.06);
      color:var(--txt); border:1px solid rgba(255,255,255,0.14); border-radius:12px; padding:12px 12px;
      outline:none; backdrop-filter: blur(10px) saturate(150%);
    }
    button{
      appearance:none; border:none; border-radius:12px; padding:10px 14px; color:#04131d; font-weight:700; cursor:pointer;
      background: linear-gradient(180deg, #a8e2ff, #77caff); box-shadow: 0 6px 18px rgba(124,199,255,0.35);
    }
    button:disabled{ opacity:0.6; cursor:not-allowed; }
    .hint{ font-size:12px; color:var(--muted); padding:0 4px 10px 4px; }
  </style>
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex">
  <meta name="description" content="轻巧液态玻璃风格的 Cloudflare Worker 对话页面" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='28' fill='%2377caff'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-size='28' fill='%2304131d'%3ENC%3C/text%3E%3C/svg%3E">
  </head>
<body>
  <div class="app">
    <header class="glass">
      <div class="title">南昌话对话</div>
      <div class="right">Cloudflare Worker · Liquid Glass</div>
    </header>
    <section class="chat glass">
      <div id="messages" class="messages"></div>
      <div class="hint">提示：后端使用 Gemini API，密钥与地址由环境变量配置。</div>
      <div class="bar">
        <textarea id="input" rows="1" placeholder="输入内容… Ctrl/⌘+Enter 发送"></textarea>
        <button id="send">发送</button>
      </div>
    </section>
  </div>
  <script>
    const elMsgs = document.getElementById('messages');
    const elInput = document.getElementById('input');
    const elSend = document.getElementById('send');

    let sending = false;
    const messages = [];

    function addMessage(role, content){
      const item = document.createElement('div');
      item.className = 'msg ' + (role === 'user' ? 'user' : 'assistant');
      item.textContent = content;
      elMsgs.appendChild(item);
      elMsgs.scrollTop = elMsgs.scrollHeight;
    }

    async function send(){
      const text = elInput.value.trim();
      if(!text || sending) return;
      sending = true; elSend.disabled = true;
      messages.push({ role: 'user', content: text });
      addMessage('user', text);
      elInput.value = '';

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        const data = await res.json();
        const reply = data?.content || '[无内容]';
        messages.push({ role: 'assistant', content: reply });
        addMessage('assistant', reply);
      } catch (err) {
        addMessage('assistant', '请求失败：' + (err?.message || err));
      } finally {
        sending = false; elSend.disabled = false; elInput.focus();
      }
    }

    elSend.addEventListener('click', send);
    elInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
      // auto-grow
      const max = 160, min = 42;
      elInput.style.height = 'auto';
      elInput.style.height = Math.min(max, Math.max(min, elInput.scrollHeight)) + 'px';
    });

    // Focus on load
    elInput.focus();
  </script>
</body>
</html>`;
}
