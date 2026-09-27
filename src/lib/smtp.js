// Built-in SMTP client (no third-party email API): raw TCP via cloudflare:sockets.
// Implicit TLS on port 465, STARTTLS on other ports, AUTH PLAIN/LOGIN, multipart text + HTML in UTF-8.
// Works with any mailbox provider: Gmail / Google Workspace (App Password), Zoho, Outlook, hosting (cPanel) mail.
// Note: Cloudflare blocks outbound port 25, so use 465 or 587.
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const CRLF = '\r\n';
const ADDR = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

function b64(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const wrap76 = (s) => (s.match(/.{1,76}/g) || ['']).join(CRLF);
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

// RFC 2047 encoded words, split on character boundaries so multi-byte characters stay intact.
function encHeader(s) {
  s = oneLine(s);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [];
  let cur = '';
  for (const ch of s) {
    if (enc.encode(cur + ch).length > 45) {
      words.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64(w)}?=`).join(CRLF + ' ');
}

function addrHeader(name, addr) {
  name = oneLine(name);
  if (!name) return `<${addr}>`;
  return /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, '')}" <${addr}>` : `${encHeader(name)} <${addr}>`;
}

export function buildMessage({ from, fromName, to, subject, text, html }) {
  const domain = from.split('@')[1];
  const boundary = 'gk_' + crypto.randomUUID().replace(/-/g, '');
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body))].join(CRLF);
  return [
    `From: ${addrHeader(fromName, from)}`,
    `To: ${to.map((a) => `<${a}>`).join(', ')}`,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', text || ''),
    ...(html ? [part('text/html', html)] : []),
    `--${boundary}--`,
    '',
  ].join(CRLF);
}

class Conn {
  constructor(socket) {
    this.buf = '';
    this.dec = new TextDecoder();
    this.attach(socket);
  }
  attach(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  release() {
    this.reader.releaseLock();
    this.writer.releaseLock();
  }
  async line() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i >= 0) {
        const l = this.buf.slice(0, i).replace(/\r$/, '');
        this.buf = this.buf.slice(i + 1);
        return l;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error('koneksi ditutup oleh server');
      this.buf += this.dec.decode(value, { stream: true });
    }
  }
  async reply() {
    const lines = [];
    for (;;) {
      const l = await this.line();
      lines.push(l);
      if (l.length < 4 || l[3] !== '-') break;
    }
    return { code: Number(lines.at(-1).slice(0, 3)), text: lines.map((l) => l.slice(4)).join('\n') };
  }
  write(s) {
    return this.writer.write(enc.encode(s));
  }
  /** Send a command (null = just read) and require one of the expected reply codes. `label` hides secrets in errors. */
  async cmd(command, expect, label) {
    if (command !== null) await this.write(command + CRLF);
    const r = await this.reply();
    if (!expect.includes(r.code)) throw new Error(`${label || command || 'greeting'} → ${r.code} ${r.text}`.slice(0, 300));
    return r;
  }
}

/**
 * Send one email. cfg: { host, port, user, pass, from, fromName }. msg: { to, subject, text, html }.
 * Resolves with the server's queue reply; throws with a readable reason on failure.
 */
export async function sendMail(cfg, msg, timeoutMs = 20000) {
  const port = Number(cfg.port) || 465;
  const from = String(cfg.from || cfg.user || '').trim();
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((a) => String(a || '').trim()).filter(Boolean);
  if (!cfg.host) throw new Error('SMTP host belum diatur');
  if (!ADDR.test(from)) throw new Error('Alamat pengirim tidak valid');
  if (!to.length || !to.every((a) => ADDR.test(a))) throw new Error('Alamat penerima tidak valid');
  const implicitTls = port === 465;
  const local = /^(localhost|127\.0\.0\.1)$/.test(cfg.host);
  const socket = connect({ hostname: cfg.host, port }, { secureTransport: implicitTls ? 'on' : 'starttls', allowHalfOpen: false });
  const c = new Conn(socket);
  let timer;
  const run = async () => {
    const helo = `EHLO ${from.split('@')[1]}`;
    await c.cmd(null, [220]);
    let ehlo = await c.cmd(helo, [250]);
    if (!implicitTls) {
      if (/^STARTTLS\b/im.test(ehlo.text)) {
        await c.cmd('STARTTLS', [220]);
        c.release();
        c.buf = '';
        c.attach(socket.startTls());
        ehlo = await c.cmd(helo, [250]);
      } else if (!local) throw new Error('server tidak mendukung STARTTLS — gunakan port 465 atau 587');
    }
    if (cfg.user) {
      const mechs = (ehlo.text.match(/^AUTH[ =](.*)$/im) || [])[1]?.toUpperCase() || '';
      if (mechs.includes('PLAIN') || !mechs.includes('LOGIN')) {
        await c.cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass || ''}`)}`, [235], 'AUTH (cek user/password SMTP)');
      } else {
        await c.cmd('AUTH LOGIN', [334]);
        await c.cmd(b64(cfg.user), [334], 'AUTH user');
        await c.cmd(b64(cfg.pass || ''), [235], 'AUTH (cek user/password SMTP)');
      }
    }
    await c.cmd(`MAIL FROM:<${from}>`, [250]);
    for (const a of to) await c.cmd(`RCPT TO:<${a}>`, [250, 251]);
    await c.cmd('DATA', [354]);
    const body = buildMessage({ from, fromName: cfg.fromName, to, subject: msg.subject, text: msg.text, html: msg.html });
    await c.write(body.replace(/^\./gm, '..') + CRLF + '.' + CRLF);
    const done = await c.cmd(null, [250], 'DATA');
    await c.write('QUIT' + CRLF).catch(() => {});
    return done.text;
  };
  try {
    return await Promise.race([run(), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('waktu habis menghubungi server SMTP')), timeoutMs)))]);
  } finally {
    clearTimeout(timer);
    try {
      c.socket.close();
    } catch {}
  }
}
