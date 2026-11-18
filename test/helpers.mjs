// Test yardımcıları: geçici veri klasörüyle gerçek sunucuyu başlatır, API çağrıları yapar.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

// seed: { koleksiyon: [belgeler] } — dosya deposunun biçimi
export async function startServer({ seed = {}, env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'su-test-'));
  const sec = (seed.meta || []).find((m) => m.id === 'secrets'); // elle verilen gizli ayarlarda bildirim anahtarı da olmalı
  if (sec && !sec.vapid) sec.vapid = createRequire(path.join(ROOT, 'server.js'))('web-push').generateVAPIDKeys();
  writeFileSync(path.join(dir, 'db.json'), JSON.stringify(seed));
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), DATA_DIR: dir, JWT_SECRET: 'test-secret-123', ADMIN_PATH: 'test-panel-abc123', ADMIN_PASSWORD: 'TestSifre123!', NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const ready = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`Sunucu açılmadı:\n${logs.slice(-3000)}`)), 60000);
    const on = (b) => { logs += b; if (/SwipeUp hazır/.test(logs)) { clearTimeout(t); res(); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.on('exit', (c) => { clearTimeout(t); rej(new Error(`Sunucu kapandı (${c}):\n${logs.slice(-3000)}`)); });
  });
  await ready;
  const url = `http://127.0.0.1:${port}`;
  return {
    url, dir, logs: () => logs,
    async stop() { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000); }); rmSync(dir, { recursive: true, force: true }); },
  };
}

// İstek: dönen { status, body }
export function client(url) {
  const call = async (method, p, { token, body, headers = {} } = {}) => {
    const r = await fetch(url + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { j = txt; }
    return { status: r.status, body: j, headers: r.headers };
  };
  return { url, get: (p, o) => call('GET', p, o), post: (p, body, o = {}) => call('POST', p, { ...o, body }), del: (p, o) => call('DELETE', p, o) };
}

let n = 0;
export async function register(api, extra = {}) {
  n += 1; const username = `test${Date.now().toString(36)}${n}`;
  // Kayıt sınırı (IP başına saatte 8) testlere takılmasın: her kayıt farklı bir 127.x adresinden gelir
  const data = JSON.stringify({ username, name: `Deneme ${n}`, password: 'sifre123', birthdate: '1995-05-05', accept: true, ...extra });
  const r = await new Promise((res, rej) => {
    const u = new URL(api.url + '/api/auth/register');
    const q = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', localAddress: `127.0.${Math.floor(n / 250) + 1}.${(n % 250) + 2}`, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (resp) => {
      let t = ''; resp.on('data', (c) => { t += c; }); resp.on('end', () => res({ status: resp.statusCode, body: JSON.parse(t || '{}') }));
    });
    q.on('error', rej); q.end(data);
  });
  if (r.status !== 200) throw new Error(`Kayıt başarısız: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.token, user: r.body.user, username, password: 'sifre123' };
}
