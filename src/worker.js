export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Simple router
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getIndexHtml(env), {
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
      let cotPayload = null;
      if (hideCot) {
        const { answer, cot } = collapseCoT(text, { hardHide: true });
        text = answer;
        if (cot) {
          cotPayload = cot;
        }
      }
      return json({ content: text, cot: cotPayload });
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getIndexHtml(env) {
  const title = env?.APP_TITLE?.trim() || '南昌话-nsfw';
  // Single-file UI with liquid glass styling
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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
    .cot-details{
      margin-top:10px; padding:10px 12px; border-radius:12px; background:rgba(12,20,32,0.55);
      border:1px solid rgba(255,255,255,0.12); backdrop-filter: blur(12px) saturate(140%);
    }
    .cot-details[open]{
      box-shadow: inset 0 0 12px rgba(120,200,255,0.1), 0 8px 18px rgba(0,0,0,0.25);
    }
    .cot-summary{
      cursor:pointer; display:flex; align-items:center; justify-content:space-between;
      color:var(--muted); font-size:12px; font-weight:600; letter-spacing:0.2px;
    }
    .cot-summary span{ display:inline-flex; align-items:center; gap:6px; }
    .cot-summary::marker{ display:none; }
    .cot-summary-icon{ transition:transform 0.2s ease; opacity:0.65; }
    .cot-details[open] .cot-summary-icon{ transform:rotate(180deg); opacity:1; }
    .cot-body{
      margin:12px 0 0; padding:10px 12px; border-radius:10px; background:rgba(8,14,24,0.7);
      border:1px solid rgba(255,255,255,0.08); color:var(--txt); font-size:12px;
      white-space:pre-wrap; line-height:1.6; max-height:260px; overflow:auto;
    }
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
      <div class="title">${escapeHtml(title)}</div>
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

    function addMessage(entry){
      const role = entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : 'assistant';
      const content = typeof entry?.content === 'string' ? entry.content : '';
      const cot = typeof entry?.cot === 'string' && entry.cot.trim().length ? entry.cot.trim() : null;

      const item = document.createElement('div');
      item.className = 'msg ' + (role === 'user' ? 'user' : 'assistant');

      if (role === 'assistant' && cot) {
        const details = document.createElement('details');
        details.className = 'cot-details';
        details.setAttribute('role', 'group');
        details.setAttribute('aria-label', '思考链内容');

        const summary = document.createElement('summary');
        summary.className = 'cot-summary';
        const label = document.createElement('span');
        label.textContent = '思考链（点击展开）';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('width', '14');
        icon.setAttribute('height', '14');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.classList.add('cot-summary-icon');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M7 10l5 5 5-5z');
        icon.appendChild(path);
        summary.appendChild(label);
        summary.appendChild(icon);
        details.appendChild(summary);

        const body = document.createElement('pre');
        body.className = 'cot-body';
        body.textContent = cot;
        details.appendChild(body);

        item.appendChild(details);
      }

      const contentBlock = document.createElement('div');
      contentBlock.textContent = content;
      item.appendChild(contentBlock);
      elMsgs.appendChild(item);
      elMsgs.scrollTop = elMsgs.scrollHeight;
    }

    async function send(){
      const text = elInput.value.trim();
      if(!text || sending) return;
      sending = true; elSend.disabled = true;
      messages.push({ role: 'user', content: text });
      addMessage({ role: 'user', content: text });
      elInput.value = '';

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        const data = await res.json();
        const reply = data?.content || '[无内容]';
        const cot = typeof data?.cot === 'string' ? data.cot : null;
        messages.push({ role: 'assistant', content: reply });
        addMessage({ role: 'assistant', content: reply, cot });
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

// Collapse chain-of-thought content by separating reasoning from final answer
function collapseCoT(s, options = {}) {
  if (!s) return { answer: '', cot: null };
  const reasoningSegments = [];
  let working = String(s);

  working = captureDelimited(working, /<\s*(think|analysis|reasoning|cot)[^>]*>/gi, /<\/\s*(think|analysis|reasoning|cot)\s*>/i, reasoningSegments);
  working = captureDelimited(working, /\[(analysis|reasoning|think|cot)\]/gi, /\[\/(analysis|reasoning|think|cot)\]/i, reasoningSegments);

  working = working.replace(/```\s*(thinking|reasoning|analysis|chain[_ -]?of[_ -]?thought|cot)[^\n]*\n([\s\S]*?)```/gi, (_match, _lang, body) => {
    const trimmed = body.trim();
    if (trimmed) reasoningSegments.push(trimmed);
    return '';
  });

  working = working.replace(/<think[^>]*>[\s\S]*$/gi, reason => {
    const trimmed = reason.replace(/<think[^>]*>/i, '').trim();
    if (trimmed) reasoningSegments.push(trimmed);
    return '';
  });

  const headingResult = captureHeadingBlocks(working);
  working = headingResult.text;
  reasoningSegments.push(...headingResult.captured);

  working = working.replace(/(\n\s*){3,}/g, '\n\n');

  let answer = working.trim();
  if (options.hardHide) {
    const { finalAnswer, removed } = enforceFinalAnswerOnly(answer);
    answer = finalAnswer;
    if (removed) reasoningSegments.push(removed);
  }

  const cot = reasoningSegments
    .map(seg => seg.trim())
    .filter(Boolean)
    .join('\n\n') || null;

  return { answer: answer.trim(), cot };
}

function captureDelimited(input, startPattern, endPattern, collector) {
  const startRegex = ensureGlobal(startPattern);
  const endRegexBase = new RegExp(endPattern.source, endPattern.flags);

  let cursor = 0;
  let output = '';
  let match;

  while ((match = startRegex.exec(input)) !== null) {
    const startIdx = match.index;
    const openLength = match[0].length;
    const afterOpen = startIdx + openLength;
    const rest = input.slice(afterOpen);
    const endMatch = endRegexBase.exec(rest);
    const segmentEnd = endMatch ? afterOpen + endMatch.index : input.length;
    const closeIdx = endMatch ? segmentEnd + endMatch[0].length : input.length;

    const captured = input.slice(afterOpen, segmentEnd).trim();
    if (captured) collector.push(captured);

    output += input.slice(cursor, startIdx);
    cursor = closeIdx;

    if (!endMatch) break;
  }

  return output + input.slice(cursor);
}

function captureHeadingBlocks(input) {
  const headingRegex = /(^|\n)(\s*)(?:让我们一步一步思考|让我们来分析|让我们来一步步分析|我们一步一步|一步一步来|思考(?:过程)?|推理|分析|思路|Chain\s*of\s*Thought|Thought\s*Process|Reasoning|Analysis|Let's think step by step|Let's reason step by step|Working|Plan|Solution Outline|Strategy|Approach|Idea)[:：]?\s*/gi;
  const finalMarkerRegex = /\n\s*(?:最终答案|总结|结论|回答|答复|答案|答桉|Final Answer|Answer|Solution|Result|Output|Response|Reply)[:：]/i;
  const doubleNewlineRegex = /\n\s*\n/;

  let cursor = 0;
  let output = '';
  let match;
  const captured = [];

  while ((match = headingRegex.exec(input)) !== null) {
    const blockStart = match.index;
    const afterHeading = headingRegex.lastIndex;
    const remainder = input.slice(afterHeading);

    let sliceEnd = remainder.search(finalMarkerRegex);
    if (sliceEnd === -1) sliceEnd = remainder.search(doubleNewlineRegex);
    if (sliceEnd === -1) sliceEnd = remainder.length;

    const endIdx = afterHeading + sliceEnd;
    const blockText = input.slice(blockStart, endIdx).trim();
    if (blockText) captured.push(blockText);

    output += input.slice(cursor, blockStart);
    cursor = endIdx;
    headingRegex.lastIndex = cursor;
  }

  return { text: output + input.slice(cursor), captured };
}

function enforceFinalAnswerOnly(input) {
  const trimmed = input.trim();
  if (!trimmed) return { finalAnswer: trimmed, removed: null };

  const regex = /(?:最终答案|最后回答|总结|结论|回答|答复|答案|答桉|Here'?s\s+what\s+(?:i|we)'?ve\s+got|Here'?s\s+the\s+response|Final\s+Answer|Answer|Solution|Result|Output|Response|Reply)[:：]/gi;
  let match;
  let lastIndex = -1;
  while ((match = regex.exec(trimmed)) !== null) {
    lastIndex = match.index;
  }

  if (lastIndex !== -1) {
    const removed = trimmed.slice(0, lastIndex).trim() || null;
    const answerSegment = trimmed.slice(lastIndex);
    return { finalAnswer: cleanFinalLead(answerSegment), removed };
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    const removed = paragraphs.slice(0, -1).join('\n\n') || null;
    const answer = paragraphs[paragraphs.length - 1];
    return { finalAnswer: answer, removed };
  }

  return { finalAnswer: trimmed, removed: null };
}

function ensureGlobal(regex) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  return new RegExp(regex.source, flags.includes('g') ? flags : flags + 'g');
}

function cleanFinalLead(segment) {
  const cleaned = segment.replace(/^(?:最终答案|最后回答|总结|结论|回答|答复|答案|答桉|Here'?s\s+what\s+(?:i|we)'?ve\s+got|Here'?s\s+the\s+response|Final\s+Answer|Answer|Solution|Result|Output|Response|Reply)[:：]\s*/i, '');
  return cleaned.trim() || segment.trim();
}
