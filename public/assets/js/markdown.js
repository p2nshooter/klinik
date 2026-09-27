// Small, safe Markdown → HTML renderer (escapes all HTML first). Shared by the website and the app.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(s)) return s.replace(/"/g, '%22');
  return '#';
}

export function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) => {
    const u = safeUrl(url);
    const ext = /^https?:/i.test(u);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s;
}

export function markdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  let quote = [];
  let table = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
    quote = [];
  };
  const flushTable = () => {
    if (table.length >= 2) {
      const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(table[0]);
      const body = table.slice(2).map(cells);
      out.push(`<div class="md-table"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else table.forEach((l) => para.push(l));
    table = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
    flushTable();
  };
  let code = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (code) {
      if (/^```/.test(line)) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
      } else code.push(raw);
      continue;
    }
    if (/^```/.test(line)) {
      flushAll();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    let m;
    if (/^\|.*\|$/.test(line.trim())) {
      flushPara();
      flushList();
      flushQuote();
      table.push(line.trim());
      continue;
    } else if (table.length) flushTable();
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushAll();
      const lvl = Math.min(6, m[1].length + 1);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll();
      out.push('<hr>');
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushAll();
  return out.join('\n');
}
