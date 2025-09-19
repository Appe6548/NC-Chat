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

      const systemText = `${sysPrompt}${minimumWordCount ? `（不少于 ${minimumWordCount} 个词。）` : ''}。不要展示推理过程或“思考链”，只给出结论或简洁要点。`;

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
      let text = parts.map(p => p?.text || '').join('');
      const hideCot = String(env.HIDE_COT || '1') !== '0';
      if (hideCot) text = collapseCoT(text, { hardHide: true });
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
  <title>南昌话-nsfw</title>
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
    .msg .cot-badge{
      display:inline-flex; align-items:center; gap:6px; padding:4px 10px; margin:4px 0;
      border-radius:999px; font-size:12px; color:var(--muted); background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.16); backdrop-filter: blur(6px) saturate(140%);
    }
    .msg .cot-badge::before{ content:'🧠'; }
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
  </style>
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex">
  <meta name="description" content="轻巧液态玻璃风格的 Cloudflare Worker 对话页面" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='28' fill='%2377caff'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-size='28' fill='%2304131d'%3ENC%3C/text%3E%3C/svg%3E">
  </head>
<body>
  <div class="app">
    <header class="glass">
      <div class="title">南昌话-nsfw</div>
    </header>
    <section class="chat glass">
      <div id="messages" class="messages"></div>
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
      const safeContent = typeof content === 'string' ? content : '';
      if (role === 'assistant' && safeContent.includes('【思考链已折叠】')) {
        const fragments = safeContent.split('【思考链已折叠】');
        fragments.forEach((fragment, idx) => {
          if (fragment) item.appendChild(document.createTextNode(fragment));
          if (idx < fragments.length - 1) {
            const badge = document.createElement('span');
            badge.className = 'cot-badge';
            badge.setAttribute('title', '思考链已折叠。如需查看，请关闭 HIDE_COT 环境变量。');
            badge.setAttribute('role', 'note');
            badge.textContent = '思考链已折叠';
            item.appendChild(badge);
          }
        });
      } else {
        item.textContent = safeContent;
      }
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

// Collapse common chain-of-thought markers to a placeholder without exposing details
function collapseCoT(s, options = {}) {
  if (!s) return s;
  let out = String(s);

  // Strip delimited reasoning tags such as <think>...</think>
  out = stripDelimited(out, /<\s*(think|analysis|reasoning|cot)[^>]*>/gi, /<\/\s*(think|analysis|reasoning|cot)\s*>/i);
  out = stripDelimited(out, /\[(analysis|reasoning|think|cot)\]/gi, /\[\/(analysis|reasoning|think|cot)\]/i);

  // Remove fenced blocks that explicitly mark reasoning-like languages
  out = out.replace(/```\s*(thinking|reasoning|analysis|chain[_ -]?of[_ -]?thought|cot)[\s\S]*?```/gi, '【思考链已折叠】');

  // Collapse inline <think>... style tags that may lack closing tag
  out = out.replace(/<think[^>]*>[\s\S]*$/gi, '【思考链已折叠】');

  // Collapse common textual lead-ins while preserving the final answer markers.
  out = collapseHeadingBlocks(out);

  // Normalize duplicated placeholders and tidy surrounding whitespace/punctuation
  out = out.replace(/(【思考链已折叠】\s*){2,}/g, '【思考链已折叠】');
  out = out.replace(/【思考链已折叠】(?=[，。：,.;!?！？])/g, '【思考链已折叠】');

  if (options.hardHide) {
    out = enforceFinalAnswerOnly(out);
  }

  return out;
}

function stripDelimited(input, startPattern, endPattern) {
  let text = input;
  let result = '';
  let cursor = 0;
  const startRegex = new RegExp(startPattern.source, startPattern.flags.includes('g') ? startPattern.flags : startPattern.flags + 'g');
  let match;

  while ((match = startRegex.exec(text)) !== null) {
    const startIdx = match.index;
    const openLength = match[0].length;
    const afterOpen = startIdx + openLength;
    const rest = text.slice(afterOpen);
    const endRegex = new RegExp(endPattern.source, endPattern.flags); // do not force global to avoid skipping
    const endMatch = endRegex.exec(rest);
    const endIdx = endMatch ? afterOpen + endMatch.index + endMatch[0].length : text.length;

    result += text.slice(cursor, startIdx) + '【思考链已折叠】';
    cursor = endIdx;
    startRegex.lastIndex = cursor;
    if (!endMatch) break;
  }

  return result + text.slice(cursor);
}

function collapseHeadingBlocks(input) {
  const headingRegex = /(^|\n)(\s*)(?:让我们一步一步思考|让我们来分析|让我们来一步步分析|我们一步一步|一步一步来|思考(?:过程)?|推理|分析|思路|Chain\s*of\s*Thought|Thought\s*Process|Reasoning|Analysis|Let's think step by step|Let's reason step by step|Working|Plan|Solution Outline)[:：]?\s*/gi;
  const finalMarkerRegex = /\n\s*(?:最终答案|总结|结论|回答|答复|答案|答桉|Final Answer|Answer|Solution|Result|Output|Response|Reply)[:：]/i;
  const doubleNewlineRegex = /\n\s*\n/;

  let result = '';
  let cursor = 0;
  let match;

  while ((match = headingRegex.exec(input)) !== null) {
    const headingStart = match.index + match[1].length;
    const afterHeading = headingRegex.lastIndex;
    const remainder = input.slice(afterHeading);

    let sliceEnd = remainder.search(finalMarkerRegex);
    if (sliceEnd === -1) {
      sliceEnd = remainder.search(doubleNewlineRegex);
    }
    if (sliceEnd === -1) {
      sliceEnd = remainder.length;
    }

    const endIdx = afterHeading + sliceEnd;
    result += input.slice(cursor, headingStart) + '【思考链已折叠】';
    cursor = endIdx;
    headingRegex.lastIndex = cursor;
  }

  return result + input.slice(cursor);
}

function enforceFinalAnswerOnly(input) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Skip if placeholder already substituted the entire content
  if (/^【思考链已折叠】$/.test(trimmed)) return trimmed;

  const hasReasoningHints = /(一步一步|思考|推理|分析|策略|步骤|goal|let's\s+|i need to|first|second|third|overall|objective|need to be|supposed to)/i.test(trimmed);
  if (!hasReasoningHints) return trimmed;

  const sliceIdx = findFinalAnswerStart(trimmed);
  if (sliceIdx !== -1) {
    return cleanFinalLead(trimmed.slice(sliceIdx));
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    const candidate = paragraphs[paragraphs.length - 1];
    if (candidate && candidate.length <= 800) {
      return candidate;
    }
  }

  return trimmed;
}

function findFinalAnswerStart(text) {
  const regex = /(?:最终答案|最后回答|总结|结论|回答|答复|答案|答桉|Here'?s\s+what\s+(?:i|we)'?ve\s+got|Here'?s\s+the\s+response|Final\s+Answer|Answer|Solution|Result|Output|Response|Reply)[:：]/gi;
  let match;
  let idx = -1;
  while ((match = regex.exec(text)) !== null) {
    idx = match.index;
  }
  return idx;
}

function cleanFinalLead(segment) {
  const cleaned = segment.replace(/^(?:最终答案|最后回答|总结|结论|回答|答复|答案|答桉|Here'?s\s+what\s+(?:i|we)'?ve\s+got|Here'?s\s+the\s+response|Final\s+Answer|Answer|Solution|Result|Output|Response|Reply)[:：]\s*/i, '');
  return cleaned.trim() || segment.trim();
}
