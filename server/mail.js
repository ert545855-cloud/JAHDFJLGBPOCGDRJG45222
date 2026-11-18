// E-posta gönderimi (şifre sıfırlama, bildirimler). Hesap iki yerden gelir:
//  1) Yönetim → Sunucu → E-posta hesabı formu (sahip yönetici; kaydetmeden önce sunucuya gerçekten giriş denenir,
//     veritabanında meta/secrets.smtp olarak durur, şifre panele hiç geri gönderilmez). Varsa önce bu kullanılır.
//  2) Sunucu ayar dosyası: Gmail için GMAIL_USER + GMAIL_APP_PASSWORD, diğerleri için SMTP_HOST, SMTP_PORT,
//     SMTP_USER, SMTP_PASS, MAIL_FROM. Yapıştırırken karışan boşluk / satır sonu / tırnaklar temizlenir.
const nodemailer = require('nodemailer');

let transport = null;
let acct = null; // panelden kaydedilen hesap
const clean = (v) => String(v ?? '').replace(/[\r\n]+/g, '').trim().replace(/^(['"])(.*)\1$/, '$2');
const env = (k) => clean(process.env[k]);

function conf() {
  if (acct && acct.user && acct.pass) return { kind: 'smtp', host: acct.host || 'smtp.hostinger.com', port: +acct.port || 465, user: acct.user, pass: acct.pass, from: acct.from || '', source: 'panel' };
  if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) return { kind: 'gmail', user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD').replace(/\s/g, ''), from: env('MAIL_FROM'), source: 'env' };
  if (env('SMTP_HOST')) return { kind: 'smtp', host: env('SMTP_HOST'), port: +env('SMTP_PORT') || 587, user: env('SMTP_USER'), pass: env('SMTP_PASS'), from: env('MAIL_FROM'), source: 'env' };
  return null;
}
function make(c) {
  if (c.kind === 'gmail') return nodemailer.createTransport({ service: 'gmail', auth: { user: c.user, pass: c.pass } });
  return nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.port === 465,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
}
function get() {
  if (transport) return transport;
  const c = conf();
  transport = c ? make(c) : null;
  return transport;
}
// Sunucunun verdiği hatayı Türkçe ve yapılacak işle açıkla
function explain(e) {
  const m = String(e?.message || e || '');
  if (/535|5\.7\.8|auth|invalid login|username and password/i.test(m)) return 'Kullanıcı adı ya da şifre kabul edilmedi (535). Kullanıcı adı e-posta adresinin tamamı olmalı; şifre, Hostinger panelinde bu e-posta hesabı için belirlenen şifre.';
  if (/ETIMEDOUT|ESOCKET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout/i.test(m)) return `Sunucuya bağlanılamadı (${m.slice(0, 80)}). Sunucu adını ve portu kontrol et (Hostinger: smtp.hostinger.com, 465).`;
  return m.slice(0, 200);
}

module.exports = {
  info: () => { const c = conf(); return c ? { kind: c.kind, host: c.host || null, port: c.port || null, user: c.user, from: c.from || c.user, source: c.source } : null; },
  verify: async () => { const t = get(); if (!t) throw new Error('E-posta ayarlı değil'); try { await t.verify(); } catch (e) { throw new Error(explain(e)); } return true; },
  enabled: () => !!conf(),
  // Panelden kaydedilen hesabı uygula (null: ayar dosyasına dön)
  setAccount(a) { acct = a && a.user && a.pass ? { ...a } : null; if (transport) { try { transport.close(); } catch { /* */ } } transport = null; },
  // Kaydetmeden önce dene: girişi kabul etmezse hata fırlatır
  async testAccount(a) { const t = make({ kind: 'smtp', host: a.host, port: +a.port, user: a.user, pass: a.pass }); try { await t.verify(); } catch (e) { throw new Error(explain(e)); } finally { try { t.close(); } catch { /* */ } } return true; },
  explain,
  // opts.headers: ör. kampanya e-postalarında List-Unsubscribe (tek tıkla ret)
  async send(to, subject, text, opts = {}) {
    const t = get(); const c = conf();
    if (!t || !c) throw new Error('E-posta ayarlı değil');
    const from = c.from || `SwipeUp <${c.user}>`;
    return t.sendMail({ from, to, subject, text, ...(opts.headers ? { headers: opts.headers } : {}) });
  },
};
