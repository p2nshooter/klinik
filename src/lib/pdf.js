// Minimal, fast PDF writer (no dependencies): standard Helvetica fonts, text, lines, shapes, QR codes.
// Generates documents in ~1ms so invoices/receipts/lab results fit comfortably in Worker CPU limits.
import qrcode from '../../public/assets/vendor/qrcode.mjs';

// Helvetica / Helvetica-Bold AFM widths for chars 32..126
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const WIN = { '–': 150, '—': 151, '•': 149, '’': 146, '‘': 145, '“': 147, '”': 148, '…': 133, '€': 128, '™': 153 };

function codes(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 160 && c <= 255) out.push(c);
    else if (WIN[ch]) out.push(WIN[ch]);
    else if (c === 10 || c === 13 || c === 9) out.push(32);
    else out.push(63);
  }
  return out;
}

export function textWidth(str, size = 10, bold = false) {
  const t = bold ? BOLD : HELV;
  let w = 0;
  for (const c of codes(str)) w += c >= 32 && c <= 126 ? t[c - 32] : 556;
  return (w * size) / 1000;
}

function pdfStr(str) {
  let s = '(';
  for (const c of codes(str)) {
    if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
    else if (c > 126) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return s + ')';
}

function rgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => (parseInt(v.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
}
const n = (v) => (Math.round(v * 100) / 100).toString();

export function wrapText(str, width, size = 10, bold = false) {
  const lines = [];
  for (const para of String(str ?? '').split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (textWidth(test, size, bold) <= width) line = test;
      else {
        if (line) lines.push(line);
        // hard-break very long words
        let word = w;
        while (textWidth(word, size, bold) > width && word.length > 1) {
          let i = word.length;
          while (i > 1 && textWidth(word.slice(0, i), size, bold) > width) i--;
          lines.push(word.slice(0, i));
          word = word.slice(i);
        }
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export class Page {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.ops = [];
  }
  Y(y) {
    return this.h - y;
  }
  text(x, y, str, o = {}) {
    const size = o.size || 10;
    const bold = !!o.bold;
    let s = String(str ?? '');
    if (o.maxWidth) while (s.length > 1 && textWidth(s, size, bold) > o.maxWidth) s = s.slice(0, -2) + '…';
    const w = textWidth(s, size, bold);
    let tx = x;
    if (o.align === 'right') tx = x - w;
    else if (o.align === 'center') tx = x - w / 2;
    const font = bold ? 'F2' : 'F1';
    if (o.rotate) {
      const a = (o.rotate * Math.PI) / 180;
      const c = Math.cos(a), sn = Math.sin(a);
      this.ops.push(`BT ${rgb(o.color)} rg /${font} ${n(size)} Tf ${n(c)} ${n(sn)} ${n(-sn)} ${n(c)} ${n(tx)} ${n(this.Y(y))} Tm ${pdfStr(s)} Tj ET`);
    } else {
      this.ops.push(`BT ${rgb(o.color)} rg /${font} ${n(size)} Tf ${n(tx)} ${n(this.Y(y))} Td ${pdfStr(s)} Tj ET`);
    }
    return w;
  }
  /** Wrapped paragraph; returns the y after the last line. */
  para(x, y, str, width, o = {}) {
    const size = o.size || 10;
    const lh = o.lineHeight || size * 1.4;
    for (const line of wrapText(str, width, size, o.bold)) {
      this.text(x, y, line, o);
      y += lh;
    }
    return y;
  }
  line(x1, y1, x2, y2, o = {}) {
    this.ops.push(`${rgb(o.color || '#CBD5E1')} RG ${n(o.width || 0.6)} w ${o.dash ? '[3 2] 0 d' : '[] 0 d'} ${n(x1)} ${n(this.Y(y1))} m ${n(x2)} ${n(this.Y(y2))} l S`);
  }
  rect(x, y, w, h, o = {}) {
    const r = o.radius || 0;
    const X = x, Y = this.Y(y + h);
    let path;
    if (r > 0) {
      const k = 0.5523 * r;
      path = `${n(X + r)} ${n(Y)} m ${n(X + w - r)} ${n(Y)} l ${n(X + w - r + k)} ${n(Y)} ${n(X + w)} ${n(Y + r - k)} ${n(X + w)} ${n(Y + r)} c ${n(X + w)} ${n(Y + h - r)} l ${n(X + w)} ${n(Y + h - r + k)} ${n(X + w - r + k)} ${n(Y + h)} ${n(X + w - r)} ${n(Y + h)} c ${n(X + r)} ${n(Y + h)} l ${n(X + r - k)} ${n(Y + h)} ${n(X)} ${n(Y + h - r + k)} ${n(X)} ${n(Y + h - r)} c ${n(X)} ${n(Y + r)} l ${n(X)} ${n(Y + r - k)} ${n(X + r - k)} ${n(Y)} ${n(X + r)} ${n(Y)} c h`;
    } else path = `${n(X)} ${n(Y)} ${n(w)} ${n(h)} re`;
    const fill = o.fill ? `${rgb(o.fill)} rg ` : '';
    const stroke = o.stroke ? `${rgb(o.stroke)} RG ${n(o.width || 0.8)} w [] 0 d ` : '';
    const op = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
    this.ops.push(`${fill}${stroke}${path} ${op}`);
  }
  circle(cx, cy, r, o = {}) {
    const k = 0.5523 * r, X = cx, Y = this.Y(cy);
    const path = `${n(X + r)} ${n(Y)} m ${n(X + r)} ${n(Y + k)} ${n(X + k)} ${n(Y + r)} ${n(X)} ${n(Y + r)} c ${n(X - k)} ${n(Y + r)} ${n(X - r)} ${n(Y + k)} ${n(X - r)} ${n(Y)} c ${n(X - r)} ${n(Y - k)} ${n(X - k)} ${n(Y - r)} ${n(X)} ${n(Y - r)} c ${n(X + k)} ${n(Y - r)} ${n(X + r)} ${n(Y - k)} ${n(X + r)} ${n(Y)} c h`;
    const fill = o.fill ? `${rgb(o.fill)} rg ` : '';
    const stroke = o.stroke ? `${rgb(o.stroke)} RG ${n(o.width || 0.8)} w [] 0 d ` : '';
    this.ops.push(`${fill}${stroke}${path} ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
  }
  /** Draw a QR code (top-left at x,y) of the given size in points. */
  qr(x, y, size, data, o = {}) {
    const q = qrcode(0, o.ecc || 'M');
    q.addData(String(data));
    q.make();
    const count = q.getModuleCount();
    const cell = size / (count + 2);
    const parts = [];
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (q.isDark(r, c)) parts.push(`${n(x + (c + 1) * cell)} ${n(this.Y(y + (r + 2) * cell))} ${n(cell + 0.05)} ${n(cell + 0.05)} re`);
      }
    }
    this.ops.push(`1 1 1 rg ${n(x)} ${n(this.Y(y + size))} ${n(size)} ${n(size)} re f ${rgb(o.color || '#0B1F33')} rg ${parts.join(' ')} f`);
  }
  raw(op) {
    this.ops.push(op);
  }
}

export class PDF {
  constructor({ width = 595.28, height = 841.89, title = 'Document', author = 'Global Klinik' } = {}) {
    this.w = width;
    this.h = height;
    this.pages = [];
    this.title = title;
    this.author = author;
  }
  addPage(w = this.w, h = this.h) {
    const p = new Page(w, h);
    this.pages.push(p);
    return p;
  }
  toBytes() {
    const objs = [];
    const add = (s) => objs.push(s) && objs.length;
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    add(`<< /Title ${pdfStr(this.title)} /Author ${pdfStr(this.author)} /Producer (Global Klinik) /CreationDate (D:${now}Z) >>`);
    const kids = [];
    for (const p of this.pages) {
      const stream = p.ops.join('\n');
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.w)} ${n(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [];
    // header's binary comment is 4 bytes in latin1 → encode with latin1 below
    objs.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += String(off).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
}
