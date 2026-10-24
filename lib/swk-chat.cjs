'use strict';
const crypto = require('node:crypto');
const TTL = 7 * 24 * 3600;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
class ChatError extends Error { constructor(status, message) { super(message); this.status = status; } }
const deny = (status, message) => { throw new ChatError(status, message); };
function redisStore(env) {
  return async function command(...args) {
    const response = await fetch(env.SWK_CHAT_REDIS_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${env.SWK_CHAT_REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error('Chat storage unavailable');
    const data = await response.json(); if (data.error) throw new Error('Chat storage unavailable');
    return data.result;
  };
}
function createChat({ env = process.env, command, now = Date.now } = {}) {
  const db = command || redisStore(env);
  const prefix = 'swk:chat:v1:';
  const key = (kind, id = '') => prefix + kind + (id ? ':' + id : '');
  const configured = () => !!(env.SWK_CHAT_REDIS_URL && env.SWK_CHAT_REDIS_TOKEN && /^https:\/\//.test(env.SWK_CHAT_REDIS_URL) && /^[a-f0-9]{64}$/i.test(env.SWK_CHAT_ADMIN_PASSWORD_SHA256 || '') && (env.SWK_CHAT_SESSION_SECRET || '').length >= 32);
  async function rate(id, limit, seconds) {
    const k = key('rate', id + ':' + Math.floor(now() / (seconds * 1000)));
    const n = Number(await db('INCR', k));
    if (n === 1) await db('EXPIRE', k, seconds + 2);
    if (n > limit) deny(429, 'Please wait before trying again.');
  }
  function cookieName() { return env.VERCEL ? '__Host-swk_operator' : 'swk_operator'; }
  function cookie(value, seconds) { return `${cookieName()}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${env.VERCEL ? '; Secure' : ''}`; }
  function sign(payload) { return crypto.createHmac('sha256', env.SWK_CHAT_SESSION_SECRET).update(payload).digest('base64url'); }
  function admin(req) {
    const match = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName() + '='));
    if (!match) deny(401, 'Sign in to the SWK inbox.');
    const [payload, signature] = match.slice(cookieName().length + 1).split('.');
    if (!payload || !equal(signature, sign(payload))) deny(401, 'Your session has expired. Please sign in.');
    let session; try { session = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { deny(401, 'Please sign in again.'); }
    if (!session.exp || session.exp <= now()) deny(401, 'Your session has expired. Please sign in.');
  }
  function origin(req) {
    let u; try { u = new URL(req.headers.origin || ''); } catch { deny(403, 'Open chat from the SWK website.'); }
    const expected = env.SWK_CHAT_ORIGIN || `https://${req.headers.host}`;
    if (u.origin !== expected && u.origin !== `https://${req.headers.host}` && !(env.VERCEL_URL && u.origin === `https://${env.VERCEL_URL}`) && !(!env.VERCEL && u.origin === `http://${req.headers.host}`)) deny(403, 'Open chat from the SWK website.');
  }
  async function body(req) {
    let data = req.body;
    if (data === undefined) {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) deny(413, 'Message is too long.'); }
      try { data = JSON.parse(raw || '{}'); } catch { deny(400, 'Please send a valid request.'); }
    } else if (typeof data === 'string') { try { data = JSON.parse(data); } catch { deny(400, 'Please send a valid request.'); } }
    if (!data || Array.isArray(data) || typeof data !== 'object' || Buffer.byteLength(JSON.stringify(data)) > 8192) deny(400, 'Please send a valid request.');
    return data;
  }
  function id(value) { if (!/^[0-9a-f-]{36}$/.test(value || '')) deny(400, 'Invalid conversation.'); return value; }
  async function thread(threadId) { const raw = await db('GET', key('thread', id(threadId))); if (!raw) deny(404, 'This conversation has expired. Start a new chat.'); return JSON.parse(raw); }
  async function visitor(data) {
    const t = await thread(data.id);
    if (typeof data.token !== 'string' || data.token.length > 200 || !equal(hash(data.token), t.tokenHash)) deny(403, 'This conversation is private. Start your own chat.');
    return t;
  }
  async function append(t, text, author) {
    if (t.closed) deny(409, 'This conversation is closed. Start a new chat.');
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) deny(400, 'Enter a message of up to 2,000 characters.');
    if (Number(await db('LLEN', key('messages', t.id))) >= 200) deny(409, 'This conversation is full. Start a new chat.');
    const message = { id: crypto.randomUUID(), author, text: text.trim(), at: now() };
    await db('RPUSH', key('messages', t.id), JSON.stringify(message));
    await db('EXPIRE', key('messages', t.id), TTL);
    t.updated = message.at; t.preview = text.trim().slice(0, 120); t.lastAuthor = author;
    await db('SET', key('thread', t.id), JSON.stringify(t), 'EX', TTL);
    await db('ZADD', key('inbox'), t.updated, t.id);
    return message;
  }
  async function messages(t) {
    const rows = await db('LRANGE', key('messages', t.id), 0, 199);
    return { messages: rows.map(x => JSON.parse(x)), closed: !!t.closed, online: !!(await db('GET', key('presence'))) };
  }
  async function publicAction(req, data, ip) {
    if (configured()) await rate('public:' + ip, 100, 60);
    if (data.action === 'status') return { configured: configured(), online: configured() ? !!(await db('GET', key('presence'))) : false };
    if (!configured()) deny(503, 'Live chat is being set up. Please contact SWK on WhatsApp.');
    await rate('visitor:' + ip, 100, 60);
    if (data.action === 'start') {
      await rate('start:' + ip, 5, 3600);
      if (data.consent !== true) deny(400, 'Please agree to share this conversation with SWK.');
      if (typeof data.name !== 'string' || data.name.length > 60) deny(400, 'Use a name of up to 60 characters.');
      const token = crypto.randomBytes(32).toString('base64url');
      const t = { id: crypto.randomUUID(), tokenHash: hash(token), name: data.name.trim() || 'Website visitor', created: now(), updated: now(), closed: false };
      // Persist only after validating the initial message.
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000) deny(400, 'Enter a message of up to 2,000 characters.');
      await append(t, data.text, 'visitor');
      return { id: t.id, token, ...(await messages(t)) };
    }
    const t = await visitor(data);
    if (data.action === 'messages') return messages(t);
    if (data.action === 'send') { await rate('send:' + t.id, 20, 60); await append(t, data.text, 'visitor'); return messages(t); }
    deny(400, 'Unknown chat action.');
  }
  async function adminAction(req, res, data, ip) {
    if (!configured()) deny(503, 'SWK chat requires storage and operator settings before it can open.');
    if (data.action === 'login') {
      await rate('login:' + ip, 5, 900);
      if (typeof data.password !== 'string' || data.password.length > 512 || !equal(hash(data.password), env.SWK_CHAT_ADMIN_PASSWORD_SHA256.toLowerCase())) deny(401, 'The inbox password is incorrect.');
      const payload = Buffer.from(JSON.stringify({ exp: now() + 8 * 3600 * 1000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
      res.setHeader('Set-Cookie', cookie(`${payload}.${sign(payload)}`, 8 * 3600)); return { signedIn: true };
    }
    admin(req);
    await rate('operator:' + ip, 150, 60);
    if (data.action === 'logout') { res.setHeader('Set-Cookie', cookie('', 0)); await db('DEL', key('presence')); return { signedIn: false }; }
    if (data.action === 'presence') { if (data.online === true) await db('SET', key('presence'), '1', 'EX', 45); else await db('DEL', key('presence')); return { online: data.online === true }; }
    if (data.action === 'threads') {
      await db('ZREMRANGEBYSCORE', key('inbox'), '-inf', now() - TTL * 1000);
      const ids = await db('ZREVRANGE', key('inbox'), 0, 99);
      const threads = [];
      for (const i of ids) { const raw = await db('GET', key('thread', i)); if (raw) { const { tokenHash, ...t } = JSON.parse(raw); threads.push(t); } }
      return { threads };
    }
    const t = await thread(data.id);
    if (data.action === 'messages') return messages(t);
    if (data.action === 'reply') { await append(t, data.text, 'operator'); return messages(t); }
    if (data.action === 'close') { t.closed = true; await db('SET', key('thread', t.id), JSON.stringify(t), 'EX', TTL); return { closed: true }; }
    deny(400, 'Unknown inbox action.');
  }
  function handler(isAdmin = false) {
    return async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
      let status = 200, result;
      try {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); deny(405, 'Use POST for chat requests.'); }
        origin(req);
        const data = await body(req);
        const ip = hash(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()).slice(0, 24);
        result = isAdmin ? await adminAction(req, res, data, ip) : await publicAction(req, data, ip);
      } catch (error) { status = error.status || 503; result = { error: error.status ? error.message : 'Chat is temporarily unavailable. Please try WhatsApp.' }; }
      res.statusCode = status; res.end(JSON.stringify(result));
    };
  }
  return { visitor: handler(false), operator: handler(true) };
}
module.exports = { createChat };
