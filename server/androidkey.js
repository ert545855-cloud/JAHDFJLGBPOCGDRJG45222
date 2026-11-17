// Android imza anahtarını yalnızca bu deponun GitHub Actions derlemesine verir.
// Anahtar sunucu ayarlarında durur (/etc/swipeup.env: ANDROID_KEYSTORE_B64, ANDROID_KEYSTORE_PASS; scripts/vds/android-anahtar.sh üretir);
// derleme, GitHub'ın OIDC kimlik belgesiyle kendini kanıtlar. GitHub'a gizli değişken eklemek gerekmez.
const crypto = require('crypto');

const ISS = 'https://token.actions.githubusercontent.com';
const AUD = 'swipeup-android';

const b64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const part = (s) => JSON.parse(b64(s).toString('utf8'));

// RS256 JWT doğrulama (harici paket gerekmez).
function verifyJwt(tok, getKey) {
  const p = String(tok).split('.');
  if (p.length !== 3) throw new Error('biçim');
  const head = part(p[0]);
  if (head.alg !== 'RS256') throw new Error('algoritma');
  return getKey(head.kid).then((key) => {
    if (!key) throw new Error('anahtar kimliği');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), key, b64(p[2]));
    if (!ok) throw new Error('imza');
    const c = part(p[1]); const now = Date.now() / 1000;
    if (typeof c.exp !== 'number' || c.exp < now - 30) throw new Error('süre');
    if (typeof c.nbf === 'number' && c.nbf > now + 30) throw new Error('henüz geçerli değil');
    if (c.iss !== ISS) throw new Error('yayıncı');
    if (!(Array.isArray(c.aud) ? c.aud : [c.aud]).includes(AUD)) throw new Error('hedef');
    return c;
  });
}

module.exports = (app, ctx, opts = {}) => {
  const env = opts.env || process.env;
  const fetchJwks = opts.fetchJwks || (async () => {
    const r = await fetch(ISS + '/.well-known/jwks', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('jwks ' + r.status);
    return (await r.json()).keys || [];
  });
  const repo = env.ANDROID_KEY_REPO || 'ert545855-cloud/sweep-up2';
  const refs = String(env.ANDROID_KEY_REFS || 'refs/heads/main,refs/heads/android-apk').split(',').map((s) => s.trim()).filter(Boolean);
  const wf = `${repo}/.github/workflows/android.yml@`;
  let keys = [], keysAt = 0;

  async function pubKey(kid) {
    if (!keys.find((k) => k.kid === kid) || Date.now() - keysAt > 3600000) {
      keys = await fetchJwks(); keysAt = Date.now();
    }
    const k = keys.find((x) => x.kid === kid);
    return k ? crypto.createPublicKey({ key: k, format: 'jwk' }) : null;
  }

  app.post('/api/internal/android-key', async (req, res) => {
    const ip = ctx.ipOf ? ctx.ipOf(req) : req.ip;
    if (ctx.limited && ctx.limited('akey:' + ip, 10, 600000)) return res.status(429).json({ error: 'çok fazla istek' });
    const ks = env.ANDROID_KEYSTORE_B64, pass = env.ANDROID_KEYSTORE_PASS;
    if (!ks || !pass) return res.status(404).json({ error: 'anahtar tanımlı değil' });
    const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try {
      const c = await verifyJwt(tok, pubKey);
      if (c.repository !== repo) throw new Error('depo');
      if (!refs.includes(c.ref)) throw new Error('dal');
      if (!['push', 'workflow_dispatch'].includes(c.event_name)) throw new Error('olay');
      if (!String(c.job_workflow_ref || '').startsWith(wf)) throw new Error('iş akışı');
      console.log(`[android-key] verildi: ${c.ref} ${String(c.sha || '').slice(0, 7)} çalıştırma ${c.run_id}`);
      res.set('Cache-Control', 'no-store').json({ keystore: ks, pass });
    } catch (e) {
      console.warn('[android-key] reddedildi:', e.message);
      res.status(403).json({ error: 'yetkisiz' });
    }
  });
};
