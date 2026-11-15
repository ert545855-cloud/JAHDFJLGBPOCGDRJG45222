// Hata izleme — yönetim paneli modülü: kullanıcıların tarayıcısında ve sunucuda oluşan hatalar, gruplanmış hâlde
export default async function errorsAdmin(main, H) {
  const { api, esc, toast, head, dt, icon, userCell } = H;
  const KIND = { js: ['bad', 'Uygulama (JS)'], promise: ['bad', 'Yakalanmamış'], api: ['warn', 'API 5xx'], server: ['bad', 'Sunucu'], gsi: ['warn', 'Google girişi'], resource: ['warn', 'Dosya yüklenemedi'] };
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.round(s / 60)} dk önce` : s < 86400 ? `${Math.round(s / 3600)} sa önce` : `${Math.round(s / 86400)} gün önce`; };
  const top = (o, n = 3) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const spark = (a) => { const m = Math.max(1, ...a); return `<span class="er-spark" title="Son 24 saat">${a.map((v) => `<i style="height:${Math.max(2, Math.round((v / m) * 22))}px" class="${v ? 'on' : ''}"></i>`).join('')}</span>`; };
  let st = 'open'; let kind = '';
  const draw = async () => {
    const r = await api(`/errors?status=${st}${kind ? `&kind=${kind}` : ''}`);
    main.innerHTML = `${head('Hatalar', 'Kullanıcıların telefonunda ve sunucuda oluşan hatalar. Aynı hata tek satırda toplanır; çözüldü işaretlenen hata tekrar olursa yeniden açılır.', '<button class="btn sm er-clear">Çözülenleri temizle</button>')}
      <div class="stats">
        <div class="stat ${r.stats.open ? 'alert' : ''}"><b>${r.stats.open}</b><span>Açık hata</span></div>
        <div class="stat"><b>${r.stats.last24}</b><span>Son 24 saatte tekrar</span></div>
        <div class="stat"><b>${r.stats.users24}</b><span>Etkilenen kişi (24 sa)</span></div>
        <div class="stat ${r.stats.regressed ? 'alert' : ''}"><b>${r.stats.regressed}</b><span>Çözülmüşken tekrar eden</span></div>
      </div>
      <div class="er-bar"><div class="tabs">${[['open', 'Açık'], ['resolved', 'Çözüldü'], ['all', 'Tümü']].map(([k, l]) => `<button data-s="${k}" class="${st === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="tabs">${[['', 'Hepsi'], ...Object.entries(KIND).map(([k, v]) => [k, v[1]])].map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${l}${k && r.kinds[k] ? ` <span class="chip">${r.kinds[k]}</span>` : ''}</button>`).join('')}</div></div>
      <div class="er-list">${r.list.length ? r.list.map((e) => `<details class="panel er ${e.status}" data-id="${esc(e.id)}">
        <summary><span class="chip ${KIND[e.kind]?.[0] || ''}">${KIND[e.kind]?.[1] || e.kind}</span>${e.regressed ? '<span class="chip bad">Tekrar etti</span>' : ''}${e.status === 'resolved' ? '<span class="chip ok">Çözüldü</span>' : ''}
          <b class="er-msg">${esc(e.lastMsg || e.msg)}</b>
          <span class="er-meta">${e.src ? `${esc(e.src.replace(location.origin, ''))}${e.line ? `:${e.line}` : ''} · ` : ''}${e.count} kez · ${e.userCount} kişi · son ${ago(e.last)}</span>${spark(e.spark)}</summary>
        <div class="pb er-body">
          <div class="er-cols">
            <div><h4>Sayfa</h4>${top(e.routes).map(([k, v]) => `<div>${esc(k || '/')} <small>${v}</small></div>`).join('') || '—'}</div>
            <div><h4>Cihaz</h4>${top(e.uas).map(([k, v]) => `<div>${esc(k)} <small>${v}</small></div>`).join('') || '—'}</div>
            <div><h4>Sürüm</h4>${top(e.vers).map(([k, v]) => `<div>${esc(k || '?')} <small>${v}</small></div>`).join('') || '—'}</div>
            <div><h4>Zaman</h4><div>İlk: ${dt(e.first)}</div><div>Son: ${dt(e.last)}</div>${e.resolvedAt ? `<div>Çözüldü: ${dt(e.resolvedAt)}${e.resolvedBy ? ` · ${esc(e.resolvedBy)}` : ''}</div>` : ''}</div>
          </div>
          ${e.stack ? `<pre class="er-stack">${esc(e.stack)}</pre>` : ''}
          ${e.users.length ? `<h4>Etkilenen kişiler</h4><div class="er-users">${e.users.map((u) => userCell(u)).join('')}</div>` : ''}
          <div class="er-act">${e.status === 'open' ? `<button class="btn sm primary" data-a="resolve">${icon('check')} Çözüldü</button>` : '<button class="btn sm" data-a="reopen">Yeniden aç</button>'}<button class="btn sm danger" data-a="delete">Sil</button></div>
        </div></details>`).join('') : `<div class="panel pb empty">${st === 'open' ? 'Açık hata yok. Her şey yolunda görünüyor.' : 'Kayıt yok.'}</div>`}</div>`;
  };
  main.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-s]'); if (s) { st = s.dataset.s; return draw(); }
    const k = e.target.closest('[data-k]'); if (k) { kind = k.dataset.k; return draw(); }
    if (e.target.closest('.er-clear')) { if (!confirm('Çözüldü işaretli bütün kayıtlar silinsin mi?')) return; const r = await api('/errors-clear', { body: {} }); toast(`${r.removed} kayıt silindi.`); return draw(); }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const id = a.closest('[data-id]').dataset.id;
    if (a.dataset.a === 'delete' && !confirm('Bu hata kaydı silinsin mi?')) return;
    try { await api(`/errors/${id}`, { body: { action: a.dataset.a } }); toast(a.dataset.a === 'resolve' ? 'Çözüldü olarak işaretlendi.' : a.dataset.a === 'reopen' ? 'Yeniden açıldı.' : 'Silindi.'); draw(); } catch (er) { toast(er.message); }
  });
  await draw();
}
