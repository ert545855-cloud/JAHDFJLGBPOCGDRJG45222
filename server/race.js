// Swipe Race (sunucu): profil (XP, seviye, araç kilitleri), günlük görevler, tur rekorları + hayalet kayıtları,
// arkadaş / haftalık / genel sıralama (haftanın pistinde ilk üçe jeton), sohbetten meydan okuma ve
// gerçek zamanlı çok oyunculu odalar. Pist geometrisi istemciyle aynı dosyadan gelir (games/swipe-race/src);
// rekor turun hayalet kaydı sunucuda pistin üstünden, hız sınırından ve tam tur tamamlanmasından denetlenir.
const { nanoid } = require('nanoid');

module.exports = function race(app, ctx) {
  const { store, auth, eco, notify, isBlocked, limited, io, brief } = ctx;
  const now = () => Date.now();
  const user = (id) => store.get('users', id);
  let T = null; let CARS = []; let LEGACY = {}; const TRK = {};
  import('../games/swipe-race/src/physics.js').then(async (p) => {
    T = await import('../games/swipe-race/src/track.js');
    CARS = p.CAR_DEFS; LEGACY = p.LEGACY_CARS || {};
    for (const d of T.TRACKS) { const lay = T.buildLayout(d.seq); const cl = T.buildCenterline(lay.pieces); TRK[d.id] = { cl, name: d.name, minLap: Math.round((cl.L / 62) * 1000) }; }
  }).catch((e) => console.error('[race] pistler yüklenemedi', e));
  const trackOk = (id) => !!TRK[id];

  // ---------- profil ----------
  const LVL = 150; const levelOf = (xp) => 1 + Math.floor((xp || 0) / LVL);
  const prof = (uid) => store.get('race_profile', uid) || { id: uid, xp: 0, wins: 0, races: 0, cars: [], dayXp: 0, day: '' };
  const save = (p) => store.put('race_profile', { ...p, at: now() });
  // eski sürümde jetonla alınan araç yeni karşılığına sayılır
  const bought = (p) => (p.cars || []).map((id) => LEGACY[id] || id);
  const owns = (p, d) => !!d && (d.price === 0 || levelOf(p.xp) >= d.lvl || bought(p).includes(d.id));
  const today = () => new Date(now() + 3 * 3600000).toISOString().slice(0, 10);
  const DAY_XP = 2500;
  function addXp(p, n) {
    const d = today(); if (p.day !== d) { p.day = d; p.dayXp = 0; }
    const add = Math.max(0, Math.min(n, DAY_XP - p.dayXp)); p.dayXp += add; p.xp = (p.xp || 0) + add; return add;
  }

  // ---------- günlük görevler ----------
  const QUESTS = [
    ['race3', '3 yarış bitir', 3], ['podium', 'İlk 3’e gir', 1], ['win', 'Bir yarış kazan', 1], ['coins', '25 altın topla', 25],
    ['items', '5 eşya kullan', 5], ['clean', 'Duvara değmeden bir tur at', 1], ['night', 'Gece yarışı bitir', 1], ['hard', 'Zor modda ilk 3’e gir', 1],
    ['ghost', 'Bir hayaletle yarış', 1], ['mp', 'Arkadaşlarınla yarış', 1], ['cup', 'Bir kupa serisini bitir', 1], ['laps9', '9 tur at', 9],
  ];
  const QXP = 80; const QBONUS = 150;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function questsOf(p) {
    const d = today();
    if (!p.q || p.q.day !== d) {
      const pool = QUESTS.slice(); const pick = []; let h = hash(p.id + d);
      while (pick.length < 3) { const i = h % pool.length; pick.push(pool.splice(i, 1)[0][0]); h = hash(String(h)); }
      p.q = { day: d, list: pick.map((k) => ({ k, got: 0, claimed: false })), bonus: false };
    }
    return p.q;
  }
  const questsOut = (p) => { const q = questsOf(p); return { list: q.list.map((x) => { const def = QUESTS.find((y) => y[0] === x.k); return { k: x.k, name: def[1], n: def[2], got: Math.min(def[2], x.got), claimed: x.claimed }; }), bonus: q.bonus, xp: QXP, bonusXp: QBONUS }; };
  function bump(p, k, n = 1) { const q = questsOf(p); const x = q.list.find((y) => y.k === k); if (x && !x.claimed) x.got += n; }

  // ---------- haftalık turnuva ----------
  const DAYMS = 86400000; const PRIZE = [50, 30, 15];
  const weekId = (t = now()) => { const d = new Date(t + 3 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10); };
  const weekEnd = (id) => Date.parse(`${id}T00:00:00Z`) - 3 * 3600000 + 7 * DAYMS;
  const weekTrack = (w = weekId()) => { const ids = T ? T.TRACKS.map((x) => x.id) : ['park']; return ids[Math.floor(Date.parse(`${w}T00:00:00Z`) / (7 * DAYMS)) % ids.length]; };
  const weekBoard = (w) => store.filter('race_week', (x) => x.week === w).sort((a, b) => a.ms - b.ms || a.at - b.at);
  function settle() {
    const w = weekId(); const meta = store.get('race_meta', 'week');
    if (!meta) { store.put('race_meta', { id: 'week', week: w }); return; }
    if (meta.week === w) return;
    const top = weekBoard(meta.week).slice(0, 3);
    top.forEach((x, k) => { eco.addCoins(x.uid, PRIZE[k], 'race_week', { week: meta.week, place: k + 1 }); notify(x.uid, { type: 'order', text: `🏁 Swipe Race haftalık turnuvasını ${k + 1}. bitirdin! ${PRIZE[k]} jeton hesabında.`, url: '/race/', tag: 'race-week' }); });
    store.put('race_meta', { id: 'week', week: w, last: { week: meta.week, top: top.map((x) => ({ uid: x.uid, ms: x.ms })) } });
  }
  const tWeek = setInterval(() => { try { settle(); } catch (e) { console.error('[race] hafta', e); } }, 5 * 60000); tWeek.unref?.();
  setTimeout(() => { try { settle(); } catch (e) { console.error('[race] hafta', e); } }, 3000).unref?.();

  // ---------- arkadaşlar ----------
  const follows = (a, b) => { const f = store.get('follows', `${a}_${b}`); return !!f && f.status !== 'pending'; };
  function friendIds(me) {
    const ids = new Set();
    store.filter('follows', (f) => f.from === me && f.status !== 'pending').forEach((f) => { if (follows(f.to, me)) ids.add(f.to); });
    store.filter('matches', (m) => (m.users || []).includes(me)).forEach((m) => ids.add(m.users.find((u) => u !== me)));
    return [...ids].filter((id) => id && !isBlocked(me, id));
  }
  const isFriend = (a, b) => (follows(a, b) && follows(b, a)) || !!store.get('matches', [a, b].sort().join('_'));
  const who = (uid) => { const u = user(uid); return u ? { ...brief(u) } : null; };

  // ---------- hayalet denetimi ----------
  // Biçim: 100 ms'de bir örnek, her örnek int16 x3 (x*10, z*10, yön*10000/π), base64
  function readGhost(g) {
    if (typeof g !== 'string' || g.length > 24000) return null;
    const buf = Buffer.from(g, 'base64'); if (buf.length % 6 || buf.length < 6 * 40) return null;
    const n = buf.length / 6; const a = new Array(n * 3);
    for (let i = 0; i < n * 3; i++) a[i] = buf.readInt16LE(i * 2);
    return { n, a };
  }
  function checkGhost(track, ms, g) {
    const t = TRK[track]; const G = readGhost(g); if (!t || !G) return false;
    const exp = Math.round(ms / 100) + 1; if (Math.abs(G.n - exp) > 3) return false;
    const cl = t.cl; const out = {}; let hint = -1; let prevS = 0; let adv = 0;
    for (let k = 0; k < G.n; k++) {
      const x = G.a[k * 3] / 10; const z = G.a[k * 3 + 1] / 10;
      if (k > 0) { const dx = x - G.a[(k - 1) * 3] / 10; const dz = z - G.a[(k - 1) * 3 + 1] / 10; if (Math.hypot(dx, dz) > 9.5) return false; }
      hint = hint < 0 ? T.nearestGlobal(cl, x, z, 0) : hint;
      hint = T.project(cl, x, z, hint, out);
      if (Math.abs(out.lat) > out.wall + 2.5) return false;
      if (k > 0) { let dd = out.s - prevS; if (dd > cl.L / 2) dd -= cl.L; else if (dd < -cl.L / 2) dd += cl.L; adv += dd; }
      prevS = out.s;
    }
    return adv > cl.L * 0.95 && adv < cl.L * 1.1;
  }

  // ---------- uçlar ----------
  const carsOut = (p) => CARS.map((d) => ({ id: d.id, owned: owns(p, d), lvl: d.lvl, price: d.price }));
  const meOut = (uid) => {
    const p = prof(uid); const best = {};
    store.filter('race_laps', (x) => x.uid === uid).forEach((x) => { best[x.track] = x.ms; });
    const w = weekId(); const mineW = store.get('race_week', `${w}:${uid}`);
    return { xp: p.xp, level: levelOf(p.xp), lvlXp: LVL, wins: p.wins, races: p.races, cars: carsOut(p), best, quests: questsOut(p), week: { id: w, track: weekTrack(w), endsAt: weekEnd(w), prize: PRIZE, mine: mineW ? mineW.ms : null } };
  };
  app.get('/api/race/me', auth, (req, res) => { const p = prof(req.user.id); questsOf(p); save(p); res.json(meOut(req.user.id)); });

  app.post('/api/race/finish', auth, (req, res) => {
    if (!T) return res.status(503).json({ error: 'Biraz sonra dene.' });
    const uid = req.user.id; const b = req.body || {};
    if (limited(`rfin:${uid}`, 60, 3600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const track = String(b.track || ''); if (!trackOk(track)) return res.status(400).json({ error: 'Pist bulunamadı.' });
    const mode = ['race', 'cup', 'ghost', 'mp'].includes(b.mode) ? b.mode : 'race';
    const t = TRK[track];
    const laps = (Array.isArray(b.laps) ? b.laps : []).slice(0, 5).map(Number).filter((x) => Number.isFinite(x));
    if (!laps.length || laps.some((x) => x < t.minLap || x > 15 * 60000)) return res.status(400).json({ error: 'Geçersiz tur süresi.' });
    const n = Math.max(1, Math.min(6, b.n | 0 || 1));
    let place = Math.max(1, Math.min(n, b.place | 0 || n));
    if (mode === 'mp') { const r = rooms.get(String(b.room || '')); const pl = r && r.players.find((x) => x.uid === uid); if (!pl || !pl.place) return res.status(400).json({ error: 'Oda bulunamadı.' }); place = pl.place; }
    const diff = Math.max(0, Math.min(2, b.diff | 0));
    const p = prof(uid); questsOf(p);
    const racing = mode !== 'ghost';
    let xp = racing ? 25 + (n - place) * 6 : 12;
    if (mode === 'race' || mode === 'cup') xp = Math.round(xp * [0.8, 1, 1.25][diff]);
    if (b.night) xp += 5;
    const before = levelOf(p.xp);
    const gained = addXp(p, xp);
    p.races = (p.races || 0) + 1;
    if (racing && place === 1 && n > 1) p.wins = (p.wins || 0) + 1;
    bump(p, 'race3'); bump(p, 'laps9', laps.length);
    if (racing && n > 1 && place <= 3) bump(p, 'podium');
    if (racing && n > 1 && place === 1) bump(p, 'win');
    if (racing && diff === 2 && place <= 3 && mode !== 'mp') bump(p, 'hard');
    bump(p, 'coins', Math.max(0, Math.min(60, b.coins | 0)));
    bump(p, 'items', Math.max(0, Math.min(20, b.items | 0)));
    if ((b.clean | 0) > 0) bump(p, 'clean');
    if (b.night) bump(p, 'night');
    if (mode === 'ghost') bump(p, 'ghost');
    if (mode === 'mp') bump(p, 'mp');
    if (b.cupDone) bump(p, 'cup');
    // rekor tur + hayalet
    let record = null; let weekRank = null;
    const lap = b.lap && Number(b.lap.ms);
    if (lap && laps.includes(lap) && checkGhost(track, lap, b.lap.ghost)) {
      const id = `${track}:${uid}`; const prev = store.get('race_laps', id);
      const bc = LEGACY[b.car] || b.car; const car = CARS.find((d) => d.id === bc) ? bc : CARS[0].id;
      if (!prev || lap < prev.ms) { store.put('race_laps', { id, uid, track, ms: lap, car, variant: Math.max(0, Math.min(3, b.variant | 0)), ghost: b.lap.ghost, at: now() }); record = { ms: lap, prev: prev ? prev.ms : null }; }
      const w = weekId();
      if (track === weekTrack(w)) {
        const wid = `${w}:${uid}`; const pw = store.get('race_week', wid);
        if (!pw || lap < pw.ms) store.put('race_week', { id: wid, week: w, uid, track, ms: lap, at: now() });
        weekRank = weekBoard(w).findIndex((x) => x.uid === uid) + 1;
      }
    }
    save(p);
    const after = levelOf(p.xp);
    const unlocked = after > before ? CARS.filter((d) => d.price > 0 && d.lvl > before && d.lvl <= after && !bought(p).includes(d.id)).map((d) => d.name) : [];
    res.json({ gained, ...meOut(uid), leveledUp: after > before, unlocked, record, weekRank });
  });

  app.post('/api/race/quests/:k/claim', auth, (req, res) => {
    const p = prof(req.user.id); const q = questsOf(p); const x = q.list.find((y) => y.k === req.params.k);
    const def = x && QUESTS.find((y) => y[0] === x.k);
    if (!x || !def) return res.status(404).json({ error: 'Görev bulunamadı.' });
    if (x.claimed) return res.status(409).json({ error: 'Ödülü zaten aldın.' });
    if (x.got < def[2]) return res.status(400).json({ error: 'Görev henüz bitmedi.' });
    x.claimed = true; let gained = addXp(p, QXP); let bonus = false;
    if (!q.bonus && q.list.every((y) => y.claimed)) { q.bonus = true; gained += addXp(p, QBONUS); bonus = true; }
    save(p); res.json({ gained, bonus, ...meOut(req.user.id) });
  });

  app.post('/api/race/unlock', auth, (req, res) => {
    const cid = LEGACY[req.body?.car] || req.body?.car; const d = CARS.find((c) => c.id === cid); if (!d) return res.status(404).json({ error: 'Araç bulunamadı.' });
    const p = prof(req.user.id);
    if (owns(p, d)) return res.json(meOut(req.user.id));
    if (!eco.spend(req.user.id, d.price, 'race_car', { car: d.id })) return res.status(402).json({ error: `Yeterli jetonun yok. ${d.name} ${d.price} jeton.`, need: d.price });
    p.cars = [...(p.cars || []), d.id]; save(p);
    res.json(meOut(req.user.id));
  });

  app.get('/api/race/board', auth, (req, res) => {
    const track = String(req.query.track || ''); const scope = String(req.query.scope || 'friends'); const me = req.user.id;
    if (!trackOk(track)) return res.status(400).json({ error: 'Pist bulunamadı.' });
    let rows;
    if (scope === 'week') { const w = weekId(); rows = track === weekTrack(w) ? weekBoard(w) : []; } else if (scope === 'all') rows = store.filter('race_laps', (x) => x.track === track).sort((a, b) => a.ms - b.ms);
    else { const ids = new Set([...friendIds(me), me]); rows = store.filter('race_laps', (x) => x.track === track && ids.has(x.uid)).sort((a, b) => a.ms - b.ms); }
    const top = rows.slice(0, 50); const mine = rows.findIndex((x) => x.uid === me);
    const lapOf = (uid) => store.get('race_laps', `${track}:${uid}`);
    const out = top.map((x, i) => { const l = lapOf(x.uid); return { rank: i + 1, user: who(x.uid), ms: x.ms, car: l ? l.car : null, variant: l ? l.variant : 0, ghost: !!l, me: x.uid === me }; }).filter((x) => x.user);
    res.json({ track, scope, rows: out, mine: mine >= 0 ? { rank: mine + 1, ms: rows[mine].ms } : null, week: { id: weekId(), track: weekTrack(), endsAt: weekEnd(weekId()), prize: PRIZE } });
  });

  // hayalet: kendininki, arkadaşının ya da genel/haftalık ilk 20'deki birinin
  app.get('/api/race/ghost', auth, (req, res) => {
    const track = String(req.query.track || ''); const uid = String(req.query.uid || ''); const me = req.user.id;
    const l = store.get('race_laps', `${track}:${uid}`);
    if (!l) return res.status(404).json({ error: 'Bu pistte kaydı yok.' });
    const top = store.filter('race_laps', (x) => x.track === track).sort((a, b) => a.ms - b.ms).slice(0, 20).some((x) => x.uid === uid);
    const wtop = weekBoard(weekId()).slice(0, 20).some((x) => x.uid === uid);
    if (uid !== me && !isFriend(me, uid) && !top && !wtop && !store.get('race_chal', `${uid}:${me}:${track}`)) return res.status(403).json({ error: 'Bu hayalete erişimin yok.' });
    if (isBlocked(me, uid)) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    res.json({ track, ms: l.ms, car: l.car, variant: l.variant, ghost: l.ghost, user: who(uid) });
  });

  // meydan okuma: sohbete mesaj + bildirim (rekoruma karşı yarış bağlantısı)
  app.post('/api/race/challenge', auth, (req, res) => {
    const me = req.user.id; const to = user(String(req.body?.uid || '')); const track = String(req.body?.track || '');
    if (!to || to.id === me || isBlocked(me, to.id)) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    if (!trackOk(track)) return res.status(400).json({ error: 'Pist bulunamadı.' });
    if (limited(`rch:${me}`, 15, 3600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const l = store.get('race_laps', `${track}:${me}`); if (!l) return res.status(400).json({ error: 'Önce bu pistte bir rekor tur at.' });
    store.put('race_chal', { id: `${me}:${to.id}:${track}`, at: now() });
    const url = `/race/#ghost-${track}-${me}`;
    const s = (l.ms / 1000); const m = Math.floor(s / 60); const time = `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
    const text = `🏁 Swipe Race'te ${TRK[track].name} pistinde ${time} yaptım. Hayaletimi geçebilir misin? ${url}`;
    const chat = store.get('chats', [me, to.id].sort().join('_'));
    if (chat && ctx.sendMessage) ctx.sendMessage(chat, me, { text });
    notify(to.id, { type: 'game', fromId: me, text: `${req.user.username} sana Swipe Race'te meydan okuyor: ${time}`, url, tag: `race-ch-${me}` });
    res.json({ ok: true, chat: !!chat });
  });
  app.get('/api/race/friends', auth, (req, res) => {
    const me = req.user.id;
    res.json(friendIds(me).map(user).filter(Boolean).slice(0, 80).map((u) => ({ ...brief(u), online: !!ctx.online?.has?.(u.id) })));
  });

  // ---------- çok oyunculu odalar ----------
  const MAXP = 6; const rooms = new Map();
  const cast = (r, ev, data) => io.to(`race:${r.id}`).emit(ev, data);
  const roomView = (r) => ({ id: r.id, host: r.host, track: r.track, night: r.night, status: r.status, startAt: r.startAt, players: r.players.map((x) => ({ uid: x.uid, name: x.name, avatar: x.avatar, car: x.car, variant: x.variant, slot: x.slot, finished: x.finished, ms: x.ms, place: x.place, left: x.left })) });
  const roomOf = (uid) => [...rooms.values()].find((r) => r.status !== 'done' && r.players.some((x) => x.uid === uid && !x.left));
  function addPlayer(r, u) {
    const used = new Set(r.players.filter((x) => !x.left).map((x) => x.slot)); let slot = 0; while (used.has(slot)) slot++;
    const old = r.players.find((x) => x.uid === u.id);
    if (old) { old.left = false; old.slot = slot; return old; }
    const p = { uid: u.id, name: u.username, avatar: u.avatar || null, car: CARS[0]?.id || 'vehicle-racer', variant: 0, slot, finished: false, ms: 0, place: 0, left: false };
    r.players.push(p); return p;
  }
  function finishRoom(r) {
    if (r.status === 'done') return;
    r.status = 'done';
    const order = r.players.filter((x) => x.finished).sort((a, b) => a.ms - b.ms);
    order.forEach((x, i) => { x.place = i + 1; });
    let k = order.length; r.players.filter((x) => !x.finished).forEach((x) => { x.place = ++k; });
    cast(r, 'race:room', roomView(r));
    setTimeout(() => rooms.delete(r.id), 10 * 60000).unref?.();
  }
  const getRoom = (req, res) => { const r = rooms.get(req.params.id); if (!r) { res.status(404).json({ error: 'Oda kapanmış.' }); return null; } return r; };
  app.post('/api/race/room', auth, (req, res) => {
    const u = req.user; const track = String(req.body?.track || 'park');
    if (!trackOk(track)) return res.status(400).json({ error: 'Pist bulunamadı.' });
    if (limited(`rroom:${u.id}`, 20, 3600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const old = roomOf(u.id); if (old) leaveRoom(old, u.id);
    const r = { id: nanoid(8), host: u.id, track, night: !!req.body?.night, status: 'lobby', startAt: 0, players: [], at: now() };
    addPlayer(r, u); rooms.set(r.id, r);
    res.json(roomView(r));
  });
  app.get('/api/race/room/:id', auth, (req, res) => { const r = getRoom(req, res); if (r) res.json(roomView(r)); });
  app.post('/api/race/room/:id/join', auth, (req, res) => {
    const r = getRoom(req, res); if (!r) return;
    if (r.players.some((x) => x.uid === req.user.id && !x.left)) return res.json(roomView(r));
    if (r.status !== 'lobby') return res.status(409).json({ error: 'Yarış başlamış.' });
    if (r.players.filter((x) => !x.left).length >= MAXP) return res.status(409).json({ error: 'Oda dolu.' });
    if (isBlocked(req.user.id, r.host)) return res.status(404).json({ error: 'Oda kapanmış.' });
    const old = roomOf(req.user.id); if (old && old !== r) leaveRoom(old, req.user.id);
    addPlayer(r, req.user); cast(r, 'race:room', roomView(r)); res.json(roomView(r));
  });
  function leaveRoom(r, uid) {
    const p = r.players.find((x) => x.uid === uid); if (!p) return;
    if (r.status === 'lobby') r.players = r.players.filter((x) => x.uid !== uid); else p.left = true;
    const alive = r.players.filter((x) => !x.left);
    if (!alive.length) { rooms.delete(r.id); return; }
    if (r.host === uid) r.host = alive[0].uid;
    if (r.status === 'racing' && alive.every((x) => x.finished)) finishRoom(r);
    cast(r, 'race:room', roomView(r));
  }
  app.post('/api/race/room/:id/leave', auth, (req, res) => { const r = rooms.get(req.params.id); if (r) leaveRoom(r, req.user.id); res.json({ ok: true }); });
  app.post('/api/race/room/:id/car', auth, (req, res) => {
    const r = getRoom(req, res); if (!r) return;
    const p = r.players.find((x) => x.uid === req.user.id); if (!p || r.status !== 'lobby') return res.status(409).json({ error: 'Şu an değiştirilemez.' });
    const cid = LEGACY[req.body?.car] || req.body?.car; const d = CARS.find((c) => c.id === cid); if (!d || !owns(prof(req.user.id), d)) return res.status(403).json({ error: 'Bu araç açık değil.' });
    p.car = d.id; p.variant = Math.max(0, Math.min(d.models.length - 1, req.body?.variant | 0));
    cast(r, 'race:room', roomView(r)); res.json(roomView(r));
  });
  app.post('/api/race/room/:id/opts', auth, (req, res) => {
    const r = getRoom(req, res); if (!r) return;
    if (r.host !== req.user.id || r.status !== 'lobby') return res.status(403).json({ error: 'Yalnızca oda sahibi.' });
    if (req.body?.track && trackOk(String(req.body.track))) r.track = String(req.body.track);
    if (req.body?.night != null) r.night = !!req.body.night;
    cast(r, 'race:room', roomView(r)); res.json(roomView(r));
  });
  app.post('/api/race/room/:id/start', auth, (req, res) => {
    const r = getRoom(req, res); if (!r) return;
    if (r.host !== req.user.id) return res.status(403).json({ error: 'Yarışı oda sahibi başlatır.' });
    if (r.status !== 'lobby') return res.status(409).json({ error: 'Yarış zaten başladı.' });
    if (r.players.filter((x) => !x.left).length < 2) return res.status(409).json({ error: 'En az iki oyuncu gerekli.' });
    r.status = 'racing'; r.startAt = now() + 4500;
    r.timer = setTimeout(() => finishRoom(r), 4500 + 8 * 60000); r.timer.unref?.();
    cast(r, 'race:room', roomView(r)); res.json(roomView(r));
  });
  app.post('/api/race/room/:id/invite', auth, (req, res) => {
    const r = getRoom(req, res); if (!r) return;
    if (!r.players.some((x) => x.uid === req.user.id)) return res.status(403).json({ error: 'Önce odaya katıl.' });
    const to = user(String(req.body?.userId || ''));
    if (!to || isBlocked(req.user.id, to.id)) return res.status(404).json({ error: 'Kişi bulunamadı.' });
    if (limited(`rinv:${req.user.id}`, 30, 3600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    notify(to.id, { type: 'game', fromId: req.user.id, text: `${req.user.username} seni Swipe Race yarışına çağırıyor 🏁`, url: `/race/#room-${r.id}`, tag: `race-${r.id}` });
    res.json({ ok: true });
  });
  // bitmiş/boş odaları temizle
  const tRooms = setInterval(() => { const t = now(); for (const r of rooms.values()) if (t - r.at > 60 * 60000) rooms.delete(r.id); }, 10 * 60000); tRooms.unref?.();

  ctx.raceSocket = (socket) => {
    const uid = socket.data.userId; let room = null;
    const inRoom = (id) => { const r = rooms.get(String(id || '')); return r && r.players.some((x) => x.uid === uid) ? r : null; };
    socket.on('race:join', ({ id } = {}) => { const r = inRoom(id); if (!r) return; room = r; socket.join(`race:${r.id}`); socket.emit('race:room', roomView(r)); socket.emit('race:clock', { t: now() }); });
    socket.on('race:clock', (_, ack) => { if (typeof ack === 'function') ack(now()); });
    socket.on('race:s', (d) => {
      if (!room || room.status !== 'racing' || !Array.isArray(d) || d.length !== 9) return;
      if (limited(`rs:${uid}`, 40, 1000)) return;
      socket.volatile.to(`race:${room.id}`).emit('race:s', { u: uid, d: d.map((v) => (Number.isFinite(+v) ? +v : 0)) });
    });
    socket.on('race:item', (d) => {
      if (!room || room.status !== 'racing' || !d || limited(`ri:${uid}`, 6, 3000)) return;
      socket.to(`race:${room.id}`).emit('race:item', { u: uid, k: String(d.k || '').slice(0, 10), x: +d.x || 0, z: +d.z || 0, y: +d.y || 0 });
    });
    socket.on('race:finish', ({ ms } = {}) => {
      if (!room || room.status !== 'racing') return;
      const p = room.players.find((x) => x.uid === uid); if (!p || p.finished) return;
      const t = TRK[room.track]; ms = Number(ms);
      const real = now() - room.startAt;
      if (!t || !(ms >= t.minLap * 3) || ms > real + 3000) return; // istemci süresi sunucu saatinden kısa olamaz
      p.finished = true; p.ms = ms;
      const fin = room.players.filter((x) => x.finished).sort((a, b) => a.ms - b.ms); fin.forEach((x, i) => { x.place = i + 1; });
      cast(room, 'race:room', roomView(room));
      const alive = room.players.filter((x) => !x.left);
      if (alive.every((x) => x.finished)) { clearTimeout(room.timer); finishRoom(room); } else if (fin.length === 1) {
        clearTimeout(room.timer); const r = room; room.timer = setTimeout(() => finishRoom(r), 45000); room.timer.unref?.();
      }
    });
    socket.on('race:leave', () => { if (room) { leaveRoom(room, uid); socket.leave(`race:${room.id}`); room = null; } });
    // bağlantı koparsa 15 sn bekle: aynı kişi odaya yeniden bağlanmadıysa çıkar
    const stillHere = (r) => [...(io.sockets.adapter.rooms.get(`race:${r.id}`) || [])].some((sid) => io.sockets.sockets.get(sid)?.data?.userId === uid);
    socket.on('disconnect', () => { if (room) { const r = room; setTimeout(() => { if (rooms.has(r.id) && !stillHere(r)) leaveRoom(r, uid); }, 15000).unref?.(); } });
  };
};
