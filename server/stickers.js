// Sohbet çıkartma paketleri: ücretsiz temel paket, jetonla alınan hareketli paketler, SwipeUp+ üyelerine özel paket.
// Satın alınan paket kalıcıdır; çıkartmalar birebir ve grup sohbetlerinde sınırsız gönderilir.
const { PACKS } = require('./stickers-data');

module.exports = function stickers(app, ctx) {
  const { store, auth, eco, limited, emitTo } = ctx;
  const isPlus = (u) => (eco?.isPlus ? eco.isPlus(u) : (u?.plusUntil || 0) > Date.now());
  const owns = (u, p) => p.coins === 0 && !p.plus ? true : p.plus ? isPlus(u) : (u.stickerPacks || []).includes(p.id);
  const packOut = (u, p) => ({ id: p.id, name: p.name, desc: p.desc, coins: p.coins, plus: !!p.plus, animated: !!p.animated, owned: owns(u, p), items: p.items.map((i) => ({ id: i.id, name: i.name })) });

  app.get('/api/stickers', auth, (req, res) => res.json({ packs: PACKS.map((p) => packOut(req.user, p)), coins: req.user.coins || 0, plus: isPlus(req.user) }));

  app.post('/api/stickers/:id/buy', auth, (req, res) => {
    const p = PACKS.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Paket bulunamadı.' });
    if (p.plus) return res.status(400).json({ error: 'Bu paket SwipeUp+ üyelerine özel.', needPlus: true });
    if (owns(req.user, p)) return res.status(400).json({ error: 'Bu paket zaten sende.' });
    const pay = eco.spend(req.user.id, p.coins, 'sticker_pack', { ref: p.id });
    if (!pay) return res.status(402).json({ error: `${p.name} paketi ${p.coins} jeton.`, needCoins: true });
    const cur = store.get('users', req.user.id);
    const u = store.update('users', req.user.id, { stickerPacks: [...new Set([...(cur.stickerPacks || []), p.id])] });
    emitTo?.(req.user.id, 'wallet', {});
    res.json({ ok: true, coins: u.coins || 0, pack: packOut(u, p) });
  });

  app.post('/api/chats/:id/sticker', auth, (req, res) => {
    const chat = store.get('chats', req.params.id);
    if (!chat || !chat.members.includes(req.user.id)) return res.status(404).json({ error: 'Sohbet bulunamadı.' });
    const p = PACKS.find((x) => x.id === req.body?.pack);
    const it = p?.items.find((x) => x.id === req.body?.item);
    if (!it) return res.status(400).json({ error: 'Çıkartma bulunamadı.' });
    if (!owns(req.user, p)) return res.status(403).json({ error: p.plus ? 'Bu çıkartmalar SwipeUp+ üyelerine özel.' : 'Önce bu paketi almalısın.', needPlus: !!p.plus });
    if (limited('stk:' + req.user.id, 40, 60000)) return res.status(429).json({ error: 'Biraz yavaş 🙂' });
    const msg = ctx.sendMessage(chat, req.user.id, { text: `Çıkartma: ${it.name}`, sticker: { pack: p.id, id: it.id, name: it.name }, replyTo: req.body?.replyTo });
    if (!msg) return res.status(400).json({ error: 'Mesaj gönderilemedi.' });
    res.json({ message: ctx.msgOut(msg) });
  });

};
module.exports.PACKS = PACKS;
