// Apple ile giriş: web (Services ID) ve iOS uygulaması (paket kimliği + zorunlu nonce)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
let srv; let oidc;
const sign = (p) => jwt.sign({ iss: 'https://appleid.apple.com', sub: 'apple-user-1', email: 'a@privaterelay.appleid.com', email_verified: 'true', ...p }, privateKey, { algorithm: 'RS256', keyid: 'k1', expiresIn: 600 });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

before(async () => {
  srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise((r) => srv.listen(0, r));
  process.env.APPLE_JWKS_URL = `http://127.0.0.1:${srv.address().port}/keys`;
  process.env.APPLE_CLIENT_ID = 'com.swipeup.web';
  delete process.env.IOS_BUNDLE;
  oidc = require('../server/oidc.js');
});
after(() => srv?.close());

test('web: Services ID ile gelen belge kabul edilir', async () => {
  const id = await oidc.verify('apple', sign({ aud: 'com.swipeup.web' }));
  assert.equal(id.sub, 'apple-user-1'); assert.equal(id.email, 'a@privaterelay.appleid.com');
});

test('iOS uygulaması: paket kimliği + doğru nonce kabul, nonce yoksa / yanlışsa ret', async () => {
  const tok = sign({ aud: 'app.swipeup.ios', nonce: sha('tek-kullanim-123') });
  assert.equal((await oidc.verify('apple', tok, { nonce: 'tek-kullanim-123' })).sub, 'apple-user-1');
  await assert.rejects(() => oidc.verify('apple', tok));
  await assert.rejects(() => oidc.verify('apple', tok, { nonce: 'baska' }));
  await assert.rejects(() => oidc.verify('apple', sign({ aud: 'com.baska.uygulama', nonce: sha('x') }), { nonce: 'x' }));
});
