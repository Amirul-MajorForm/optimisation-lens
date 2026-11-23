// Login for MajorView: email + password, then a signed session cookie.
//
// Users live in the MAJORVIEW_USERS environment variable (Railway), never in
// the code: a JSON list of { "email", "name", "password" } where "password" is
// a salted scrypt hash made with `node backend/scripts/hash-password.js`.
//   MAJORVIEW_USERS=[{"email":"zai@majorform.co","name":"Zai","password":"scrypt$..."}]
// SESSION_SECRET signs the cookie (any long random string).
//
// When MAJORVIEW_USERS is not set, login is off and the dashboard is open as
// before, so a deploy can never lock everyone out before users are added.

import crypto from 'node:crypto';

const COOKIE = 'mv_session';
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(String(password), salt, 32);
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function loadUsers() {
  const raw = process.env.MAJORVIEW_USERS;
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(u => u?.email && u?.password) : [];
  } catch (err) {
    console.error('[auth] MAJORVIEW_USERS is not valid JSON; nobody can log in until it is fixed');
    return [];
  }
}
export const authEnabled = () => loadUsers() !== null;

// Without SESSION_SECRET, a random secret per server start (sessions end on restart)
let fallbackSecret = null;
const secret = () => process.env.SESSION_SECRET || (fallbackSecret ||= crypto.randomBytes(32).toString('hex'));
const sign = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function makeSession(user) {
  const body = Buffer.from(JSON.stringify({ email: user.email, name: user.name || user.email.split('@')[0], exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readSession(req) {
  const cookie = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`));
  if (!cookie) return null;
  const [body, mac] = decodeURIComponent(cookie.slice(COOKIE.length + 1)).split('.');
  if (!body || !mac) return null;
  const want = sign(body);
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!(s.exp > Date.now())) return null;
    // The user must still be in the list (removing someone ends their access)
    const user = (loadUsers() || []).find(u => u.email.toLowerCase() === String(s.email).toLowerCase());
    return user ? { email: user.email, name: user.name || s.name } : null;
  } catch { return null; }
}
function setCookie(req, res, value, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`);
}

// Simple brute-force guard: 10 failed attempts per IP per 15 minutes
const attempts = new Map();
const tooMany = ip => {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 10;
};

export function installAuth(app) {
  app.post('/api/auth/login', (req, res) => {
    const users = loadUsers();
    if (users === null) return res.json({ user: null, authRequired: false });
    const ip = req.ip || 'unknown';
    if (tooMany(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const { email, password } = req.body || {};
    const user = users.find(u => u.email.toLowerCase() === String(email || '').trim().toLowerCase());
    if (!user || !checkPassword(password, user.password)) {
      attempts.get(ip).push(Date.now());
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    setCookie(req, res, makeSession(user), SESSION_DAYS * 86400);
    res.json({ user: { email: user.email, name: user.name || user.email.split('@')[0] }, authRequired: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!authEnabled()) return res.json({ user: null, authRequired: false });
    const user = readSession(req);
    if (!user) return res.status(401).json({ error: 'Not logged in', authRequired: true });
    res.json({ user, authRequired: true });
  });

  // Every other API call needs a session (when login is on)
  app.use('/api', (req, res, next) => {
    if (!authEnabled() || req.path.startsWith('/auth/')) return next();
    const user = readSession(req);
    if (!user) return res.status(401).json({ error: 'Not logged in', authRequired: true });
    req.user = user;
    next();
  });
}
