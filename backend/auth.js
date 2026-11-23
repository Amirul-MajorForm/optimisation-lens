// Login for MajorView: one shared email + password, then a signed session cookie.
//
// Set both in Railway (Variables):
//   MAJORVIEW_EMAIL=team@majorform.co
//   MAJORVIEW_PASSWORD=some-passcode
// When either is missing, login is off and the dashboard is open as before,
// so a deploy can never lock everyone out.
//
// The cookie is signed with a key made from the email + password (or
// SESSION_SECRET, if set), so changing the password logs everyone out.

import crypto from 'node:crypto';

const COOKIE = 'mv_session';
const SESSION_DAYS = 30;

const login = () => {
  const email = String(process.env.MAJORVIEW_EMAIL || '').trim();
  const password = String(process.env.MAJORVIEW_PASSWORD || '');
  return email && password ? { email, password } : null;
};
export const authEnabled = () => login() !== null;

// Compare without leaking timing (hash both sides to equal length first)
const same = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest(),
);

const secret = () => {
  const l = login();
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update(`majorview|${l?.email}|${l?.password}`).digest('hex');
};
const sign = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function makeSession(email) {
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
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
    return s.exp > Date.now() ? { email: s.email } : null;
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
    const l = login();
    if (!l) return res.json({ user: null, authRequired: false });
    const ip = req.ip || 'unknown';
    if (tooMany(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const { email, password } = req.body || {};
    const okEmail = same(String(email || '').trim().toLowerCase(), l.email.toLowerCase());
    const okPassword = same(password || '', l.password);
    if (!okEmail || !okPassword) {
      attempts.get(ip).push(Date.now());
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    setCookie(req, res, makeSession(l.email), SESSION_DAYS * 86400);
    res.json({ user: { email: l.email }, authRequired: true });
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
