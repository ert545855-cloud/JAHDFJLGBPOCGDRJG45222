// Çifte buluşma (2'ye 2) ve müzik uyumu.
// Çifte buluşma: bir arkadaşınla (karşılıklı takip ya da eşleşme) ikili kurarsın, başka ikilileri kaydırırsın.
// İki ikili birbirini beğenince (her ikilide en az birinin beğenisi yeter) dört kişilik bir grup sohbeti açılır.
// Müzik uyumu: Spotify bağlıysa en çok dinlenen sanatçılar alınır; bağlı değilse kişi sanatçılarını elle yazabilir.
// Ortak sanatçılar kaydırma kartında ve profilde görünür.
const crypto = require('crypto');

module.exports = (app, ctx) => {
  const { store, auth, notify, emitTo, brief, isBlocked, limited, shownAge, systemMsg, groupAvatar, chatOut } = ctx;
  const now = () => Date.now();
  const nid = () => crypto.randomBytes(9).toString('base64url');
  const user = (id) => { const u = store.get('users', id); return u && !u.banned && !u.deleted ? u : null; };

  // ---------- çifte buluşma ----------
  const duoOf = (uid) => store.find('duos', (d) => d.on && (d.a === uid || d.b === uid)) || null;
  const partnerOf = (d, uid) => (d.a === uid ? d.b : d.a);
  const follows = (a, b) => { const f = store.get('follows', `${a}_${b}`); return !!f && f.status !== 'pending'; };
  const friends = (a, b) => (follows(a, b) && follows(b, a)) || !!store.get('matches', [a, b].sort().join('_'));
  const duoCard = (d, me) => {
    const us = [d.a, d.b].map(user); if (us.some((u) => !u)) return null;
    return { id: d.id, people: us.map((u) => ({ ...brief(u), age: shownAge(u), city: u.city, photo: (u.photos || [])[0] || u.avatar, bio: u.bio || '' })), city: us[0].city || us[1].city || '', mine: d.a === me || d.b === me };
  };
  const swipeOf = (from, to) => store.get('duo_swipes', `${from}_${to}`);

  app.get('/api/cifte', auth, (req, res) => {
    const me = req.user.id; const d = duoOf(me);
    const invites = store.filter('duos', (x) => !x.on && x.b === me && now() - x.at < 3 * 86400000).map((x) => { const u = user(x.a); return u && !isBlocked(me, u.id) ? { id: x.id, user: brief(u) } : null; }).filter(Boolean);
    const sent = store.find('duos', (x) => !x.on && x.a === me) || null;
    const out = { duo: d ? duoCard(d, me) : null, invites, sent: sent ? { id: sent.id, user: brief(user(sent.b) || {}) } : null, deck: [], matches: [] };
    if (d) {
      const seen = new Set(store.filter('duo_swipes', (s) => s.from === d.id).map((s) => s.to));
      const mates = [d.a, d.b];
      out.deck = store.filter('duos', (x) => x.on && x.id !== d.id && !seen.has(x.id) && ![x.a, x.b].some((u) => mates.includes(u) || mates.some((m) => isBlocked(m, u))))
        .map((x) => ({ x, liked: (() => { const s = swipeOf(x.id, d.id); return !!s && s.dir === 'right'; })() }))
        .sort((p, q) => q.liked - p.liked || q.x.at - p.x.at).slice(0, 30).map(({ x }) => duoCard(x, me)).filter(Boolean);
      out.matches = store.filter('duo_matches', (m) => m.duos.includes(d.id)).sort((p, q) => q.at - p.at).slice(0, 20).map((m) => { const c = store.get('chats', m.chatId); return c ? { chatId: c.id, name: c.name, at: m.at } : null; }).filter(Boolean);
    }
    res.json(out);
  });
  // ikili için arkadaş adayları: karşılıklı takip ettiğin ya da eşleştiğin kişiler
  app.get('/api/cifte/friends', auth, (req, res) => {
    const me = req.user.id; const ids = new Set();
    store.filter('follows', (f) => f.from === me && f.status !== 'pending').forEach((f) => { if (follows(f.to, me)) ids.add(f.to); });
    store.filter('matches', (m) => (m.users || []).includes(me)).forEach((m) => ids.add(m.users.find((u) => u !== me)));
    res.json([...ids].map(user).filter((u) => u && !isBlocked(me, u.id) && !ctx.SPECIAL?.has?.(u.role)).slice(0, 60).map((u) => ({ ...brief(u), busy: !!duoOf(u.id) })));
  });
  app.post('/api/cifte/invite', auth, (req, res) => {
    const me = req.user.id; const to = user(String(req.body?.userId || ''));
    if (!to || to.id === me || isBlocked(me, to.id)) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    if (!friends(me, to.id)) return res.status(403).json({ error: 'İkili yalnızca karşılıklı takipleştiğin ya da eşleştiğin biriyle kurulur.' });
    if (duoOf(me)) return res.status(409).json({ error: 'Zaten bir ikilin var. Yenisini kurmak için önce ikiliden ayrıl.' });
    if (duoOf(to.id)) return res.status(409).json({ error: 'Bu kişinin zaten bir ikilisi var.' });
    if (limited?.(`duoinv:${me}`, 10, 3600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    store.filter('duos', (x) => !x.on && x.a === me).forEach((x) => store.del('duos', x.id)); // önceki bekleyen davet geri çekilir
    const back = store.find('duos', (x) => !x.on && x.a === to.id && x.b === me);
    if (back) { store.put('duos', { ...back, on: true, at: now() }); notify(to.id, { type: 'match', fromId: me, text: `${req.user.username} çifte buluşma davetini kabul etti. Artık ikilisiniz!`, url: '/#/cifte' }); return res.json({ ok: true, on: true }); }
    const d = store.put('duos', { id: nid(), a: me, b: to.id, on: false, at: now() });
    notify(to.id, { type: 'match', fromId: me, text: `${req.user.username} seni çifte buluşma için ikilisi olmaya çağırıyor.`, url: '/#/cifte' });
    res.json({ ok: true, id: d.id });
  });
  app.post('/api/cifte/accept/:id', auth, (req, res) => {
    const me = req.user.id; const d = store.get('duos', req.params.id);
    if (!d || d.on || d.b !== me) return res.status(404).json({ error: 'Davet bulunamadı.' });
    if (req.body?.no) { store.del('duos', d.id); return res.json({ ok: true }); }
    if (duoOf(me) || duoOf(d.a)) { store.del('duos', d.id); return res.status(409).json({ error: 'İkilerden birinin artık başka bir ikilisi var.' }); }
    store.put('duos', { ...d, on: true, at: now() }); store.filter('duos', (x) => !x.on && (x.a === me || x.b === d.a || x.a === d.a)).forEach((x) => store.del('duos', x.id));
    notify(d.a, { type: 'match', fromId: me, text: `${req.user.username} ikilin oldu. Çifte buluşma için kaydırmaya başlayabilirsiniz!`, url: '/#/cifte' });
    res.json({ ok: true });
  });
  app.delete('/api/cifte', auth, (req, res) => {
    const d = duoOf(req.user.id); if (!d) return res.json({ ok: true });
    store.del('duos', d.id); store.filter('duo_swipes', (s) => s.from === d.id || s.to === d.id).forEach((s) => store.del('duo_swipes', s.id));
    notify(partnerOf(d, req.user.id), { type: 'match', fromId: req.user.id, text: `${req.user.username} çifte buluşma ikilisinden ayrıldı.`, url: '/#/cifte' });
    res.json({ ok: true });
  });
  app.post('/api/cifte/swipe', auth, (req, res) => {
    const me = req.user.id; const d = duoOf(me); if (!d) return res.status(400).json({ error: 'Önce bir ikili kur.' });
    const t = store.get('duos', String(req.body?.duoId || '')); const dir = req.body?.dir === 'right' ? 'right' : 'left';
    if (!t || !t.on || t.id === d.id) return res.status(404).json({ error: 'İkili bulunamadı.' });
    if ([t.a, t.b].some((u) => isBlocked(d.a, u) || isBlocked(d.b, u))) return res.status(404).json({ error: 'İkili bulunamadı.' });
    store.put('duo_swipes', { id: `${d.id}_${t.id}`, from: d.id, to: t.id, by: me, dir, at: now() });
    const partner = partnerOf(d, me);
    if (dir === 'right') emitTo(partner, 'cifte:like', { by: brief(req.user) });
    const back = swipeOf(t.id, d.id);
    if (dir !== 'right' || !back || back.dir !== 'right') {
      if (dir === 'right' && !back) [t.a, t.b].forEach((u) => notify(u, { type: 'liked', text: 'Bir ikili sizi çifte buluşma için beğendi. Görmek için kaydırın!', url: '/#/cifte' }));
      return res.json({ match: false });
    }
    const mid = [d.id, t.id].sort().join('_'); const old = store.get('duo_matches', mid);
    if (old) return res.json({ match: true, chatId: old.chatId });
    const people = [d.a, d.b, t.a, t.b]; const names = people.map((u) => user(u)?.name?.split(' ')[0] || '').filter(Boolean);
    const name = `Çifte buluşma · ${names.join(', ')}`.slice(0, 50);
    const chat = store.put('chats', { id: 'g_' + nid(), isGroup: true, name, avatar: groupAvatar(name), members: people, admins: people.slice(), createdAt: now(), lastAt: now(), cifte: mid });
    store.put('duo_matches', { id: mid, duos: [d.id, t.id], chatId: chat.id, at: now() });
    systemMsg(chat, 'Çifte buluşma eşleşmesi! İki ikili birbirini beğendi. Tanışın, bir plan yapın.');
    people.forEach((u) => { notify(u, { type: 'match', text: 'Çifte buluşma eşleşmesi! Dört kişilik sohbetiniz açıldı.', url: `/#/chat/${chat.id}` }); emitTo(u, 'cifte:match', { chatId: chat.id }); });
    res.json({ match: true, chatId: chat.id, chat: chatOut(chat, me) });
  });

  // ---------- müzik uyumu ----------
  const norm = (s) => String(s || '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
  const artistsOf = (u) => (u?.music?.artists || []);
  const common = (a, b) => { const set = new Set(artistsOf(b).map((x) => norm(x.n))); return artistsOf(a).filter((x) => set.has(norm(x.n))).map((x) => x.n); };
  ctx.musicCommon = (me, u) => common(me, u).slice(0, 5); // kaydırma kartı için
  const musicOut = (u) => ({ artists: artistsOf(u), src: u.music?.src || null, at: u.music?.at || null, spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) });
  app.get('/api/music', auth, (req, res) => res.json(musicOut(req.user)));
  app.post('/api/music', auth, (req, res) => { // sanatçıları elle yazmak
    const list = (Array.isArray(req.body?.artists) ? req.body.artists : []).map((x) => String(x || '').replace(/[<>]/g, '').trim().slice(0, 40)).filter((x) => x.length >= 2);
    const uniq = []; const seen = new Set(); for (const n of list) { const k = norm(n); if (!seen.has(k)) { seen.add(k); uniq.push({ n }); } }
    const music = uniq.length ? { artists: uniq.slice(0, 15), src: 'el', at: now() } : null;
    store.update('users', req.user.id, { music }); res.json(musicOut({ ...req.user, music }));
  });
  app.get('/api/music/with/:uid', auth, (req, res) => {
    const u = user(req.params.uid); if (!u || isBlocked(req.user.id, u.id)) return res.status(404).json({ error: 'Bulunamadı.' });
    res.json({ common: common(req.user, u), top: artistsOf(u).slice(0, 8).map((x) => x.n), src: u.music?.src || null });
  });
  // Spotify bağlantısı (SPOTIFY_CLIENT_ID ve SPOTIFY_CLIENT_SECRET tanımlıysa). Yalnızca en çok dinlenen sanatçılar bir kez okunur; anahtar saklanmaz.
  const states = new Map();
  const baseUrl = (req) => process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  app.get('/api/music/spotify', auth, (req, res) => {
    const id = process.env.SPOTIFY_CLIENT_ID; if (!id || !process.env.SPOTIFY_CLIENT_SECRET) return res.status(503).json({ error: 'Spotify bağlantısı henüz açılmadı. Sanatçılarını elle ekleyebilirsin.' });
    const st = nid(); states.set(st, { uid: req.user.id, at: now() }); for (const [k, v] of states) if (now() - v.at > 600000) states.delete(k);
    const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: `${baseUrl(req)}/api/music/spotify/cb`, scope: 'user-top-read', state: st });
    res.json({ url: `https://accounts.spotify.com/authorize?${q}` });
  });
  app.get('/api/music/spotify/cb', async (req, res) => {
    const s = states.get(String(req.query?.state || '')); states.delete(String(req.query?.state || ''));
    const done = (ok) => res.redirect(`/?spotify=${ok ? 'ok' : 'hata'}#/edit`);
    if (!s || !req.query?.code || now() - s.at > 600000) return done(false);
    try {
      const auth64 = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
      const tk = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${auth64}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: `${baseUrl(req)}/api/music/spotify/cb` }) }).then((r) => r.json());
      if (!tk.access_token) return done(false);
      const top = await fetch('https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term', { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json());
      const artists = (top.items || []).map((a) => ({ n: String(a.name).slice(0, 40) })).filter((a) => a.n);
      if (!artists.length) return done(false);
      store.update('users', s.uid, { music: { artists: artists.slice(0, 20), src: 'spotify', at: now() } }); done(true);
    } catch (e) { console.error('[spotify]', e.message); done(false); }
  });
};
