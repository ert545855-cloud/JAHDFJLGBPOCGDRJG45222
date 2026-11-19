// Panel çizelgeleri (SVG): zaman serileri ve gruplu sütunlar.
// - Az nokta (≤ 16): sütun (en fazla 24 px, üstü 4 px yuvarlak, taban düz, aralarda 2 px boşluk)
// - Çok nokta: 2 px çizgi + %10 dolgu, son noktada halkalı işaret ve değer; dikey imleç çizgisi ile tüm değerler
// - Y ekseninde yuvarlak değerler (0 / 50 / 100, 1,2B), ince yatay ızgara; X'te seyrek tarih etiketleri
// - İki seri için açıklama (gösterge) her zaman; her çizelgenin altında "Tablo" görünümü (değerler üzerine gelmeden de okunur)
// Etiketler textContent ile yazılır. Kapsayıcı genişliği değişince yeniden çizilir.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
const nf = new Intl.NumberFormat('tr-TR');
const compact = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B` : nf.format(Math.round(v)));
function niceMax(max, n = 4) { // 1-2-2,5-5 adımları
  if (max <= 0) return { top: n, step: 1 };
  const raw = max / n; const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; const s = step < 1 ? 1 : step;
  return { top: Math.ceil(max / s) * s, step: s };
}
const dayLabel = (iso) => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(+d) ? String(iso) : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); };

/**
 * chart(host, { series: [{ name, color, values: number[] }], labels: string[] (x), kind?: 'auto'|'bar'|'line', fmt?: (v) => string, tipLabel?: (i) => string, height?: number })
 * labels ISO gün (YYYY-MM-DD) ise kısa tarihe çevrilir.
 */
export function chart(host, opt) {
  const fmt = opt.fmt || ((v) => nf.format(v));
  const S = opt.series; const L = opt.labels; const n = L.length; const H = opt.height || 168;
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(L[0] || ''); const xl = (i) => (isDay ? dayLabel(L[i]) : String(L[i]));
  const kind = opt.kind && opt.kind !== 'auto' ? opt.kind : S.length > 1 || n <= 16 ? 'bar' : 'line';
  host.classList.add('vz'); host.textContent = '';
  if (S.length > 1) { // açıklama: çubukta kare, çizgide kısa çizgi
    const lg = document.createElement('div'); lg.className = 'vz-lg';
    S.forEach((s) => { const it = document.createElement('span'); const k = document.createElement('i'); k.className = kind === 'bar' ? 'sq' : 'ln'; k.style.background = s.color; it.append(k, document.createTextNode(s.name)); lg.appendChild(it); });
    host.appendChild(lg);
  }
  const box = document.createElement('div'); box.className = 'vz-box'; host.appendChild(box);
  const tip = document.createElement('div'); tip.className = 'vz-tip'; tip.hidden = true; box.appendChild(tip);
  const total = S.map((s) => s.values.reduce((a, b) => a + (b || 0), 0));
  const summary = S.map((s, k) => `${s.name}: toplam ${fmt(total[k])}`).join(', ');

  const resolve = (c) => (String(c).startsWith('var(') ? getComputedStyle(host).getPropertyValue(c.slice(4, -1)).trim() || '#888' : c); // SVG niteliğinde CSS değişkeni çalışmaz
  function draw() {
    const C = S.map((s) => resolve(s.color));
    const W = Math.max(240, Math.floor(box.clientWidth || host.clientWidth || 480));
    [...box.querySelectorAll('svg')].forEach((x) => x.remove());
    const max = Math.max(0, ...S.flatMap((s) => s.values));
    const { top, step } = niceMax(max);
    const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const yw = Math.max(...ticks.map((t) => compact(t).length)) * 6.6 + 10; // y etiketi genişliği
    const padL = yw; const padR = kind === 'line' ? 14 : 4; const padT = 14; const padB = 22;
    const pw = W - padL - padR; const ph = H - padT - padB; const y = (v) => padT + ph - (v / top) * ph;
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${opt.title || 'Çizelge'}. ${summary}` });
    box.insertBefore(svg, tip);
    const g = el('g', { class: 'vz-grid' }, svg);
    ticks.forEach((t) => { el('line', { x1: padL, x2: W - padR, y1: y(t) + 0.5, y2: y(t) + 0.5 }, g); const tx = el('text', { x: padL - 8, y: y(t) + 4, 'text-anchor': 'end' }, g); tx.textContent = compact(t); });
    // x etiketleri: en fazla ~7 tane, eşit aralıklı, son nokta her zaman
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 64))));
    const xs = (i) => (kind === 'bar' ? padL + (i + 0.5) * (pw / n) : padL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw));
    for (let i = 0; i < n; i++) if ((n - 1 - i) % every === 0) { const tx = el('text', { x: xs(i), y: H - 6, 'text-anchor': kind === 'line' && i === n - 1 ? 'end' : kind === 'line' && i === 0 ? 'start' : 'middle', class: 'vz-x' }, svg); tx.textContent = xl(i); }

    const hits = el('g', { class: 'vz-hits' }, svg);
    const show = (i, px) => {
      tip.textContent = '';
      const h = document.createElement('div'); h.className = 'vz-th'; h.textContent = opt.tipLabel ? opt.tipLabel(i) : (isDay ? new Date(`${L[i]}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' }) : xl(i)); tip.appendChild(h);
      S.forEach((s) => { const r = document.createElement('div'); r.className = 'vz-tr'; const k = document.createElement('i'); k.style.background = s.color; const b = document.createElement('b'); b.textContent = fmt(s.values[i] || 0); const sp = document.createElement('span'); sp.textContent = s.name; r.append(k, b, sp); tip.appendChild(r); });
      tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = `${Math.min(W - tw - 2, Math.max(2, px - tw / 2))}px`; tip.style.top = '0px';
    };
    const hide = () => { tip.hidden = true; svg.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); cross?.setAttribute('opacity', 0); };
    let cross = null;

    if (kind === 'bar') {
      const band = pw / n; const k = S.length; const gap = 2;
      const bw = Math.max(2, Math.min(24, (band * 0.72 - gap * (k - 1)) / k)); const gw = bw * k + gap * (k - 1);
      const marks = el('g', {}, svg);
      for (let i = 0; i < n; i++) {
        const x0 = padL + i * band + (band - gw) / 2; const grp = el('g', { class: 'vz-bar' }, marks);
        S.forEach((s, j) => {
          const v = s.values[i] || 0; if (v <= 0) return; const x = x0 + j * (bw + gap); const yy = y(v); const hgt = padT + ph - yy; const r = Math.min(4, bw / 2, hgt);
          el('path', { d: `M${x},${padT + ph} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${padT + ph} Z`, fill: C[j] }, grp);
        });
        const hit = el('rect', { x: padL + i * band, y: padT, width: band, height: ph, fill: 'transparent', tabindex: 0, 'aria-label': `${xl(i)}: ${S.map((s) => `${s.name} ${fmt(s.values[i] || 0)}`).join(', ')}` }, hits);
        const on = () => { hide(); grp.classList.add('on'); show(i, padL + (i + 0.5) * band); };
        hit.addEventListener('pointerenter', on); hit.addEventListener('focus', on); hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
      }
      if (k === 1 && n) { // tek seride yalnız en yüksek sütunun değeri yazılır
        const v = S[0].values; const im = v.indexOf(Math.max(...v)); if (v[im] > 0) { const tx = el('text', { x: padL + (im + 0.5) * band, y: y(v[im]) - 5, 'text-anchor': 'middle', class: 'vz-val' }, svg); tx.textContent = compact(v[im]); }
      }
    } else {
      cross = el('line', { y1: padT, y2: padT + ph, class: 'vz-cross', opacity: 0 }, svg);
      S.forEach((s, j) => {
        const pts = s.values.map((v, i) => [xs(i), y(v || 0)]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        el('path', { d: `${line} L${pts[n - 1][0].toFixed(1)},${padT + ph} L${pts[0][0].toFixed(1)},${padT + ph} Z`, fill: C[j], 'fill-opacity': 0.1 }, svg);
        el('path', { d: line, fill: 'none', stroke: C[j], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
        const last = pts[n - 1]; el('circle', { cx: last[0], cy: last[1], r: 4, fill: C[j], class: 'vz-dot' }, svg);
        if (S.length === 1) { const tx = el('text', { x: last[0] - 6, y: last[1] - 9, 'text-anchor': 'end', class: 'vz-val' }, svg); tx.textContent = compact(s.values[n - 1] || 0); }
      });
      const hot = el('circle', { r: 4, class: 'vz-dot', opacity: 0, fill: C[0] }, svg);
      const hit = el('rect', { x: padL, y: padT, width: pw, height: ph, fill: 'transparent', tabindex: 0, 'aria-label': summary }, hits);
      const at = (px) => Math.max(0, Math.min(n - 1, Math.round(((px - padL) / pw) * (n - 1))));
      const move = (i) => { const x = xs(i); cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1); if (S.length === 1) { hot.setAttribute('cx', x); hot.setAttribute('cy', y(S[0].values[i] || 0)); hot.setAttribute('opacity', 1); } show(i, x); };
      let cur = n - 1;
      hit.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); cur = at(e.clientX - r.left); move(cur); });
      hit.addEventListener('pointerleave', () => { hide(); hot.setAttribute('opacity', 0); });
      hit.addEventListener('focus', () => move(cur)); hit.addEventListener('blur', () => { hide(); hot.setAttribute('opacity', 0); });
      hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cur = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1))); move(cur); } });
    }
  }
  draw();
  // Tablo görünümü (değerler üzerine gelmeden de okunur)
  const det = document.createElement('details'); det.className = 'vz-tbl'; const sm = document.createElement('summary'); sm.textContent = 'Tablo'; det.appendChild(sm);
  const tb = document.createElement('table'); const hr = tb.createTHead().insertRow(); [opt.xName || 'Tarih', ...S.map((s) => s.name)].forEach((t, i) => { const th = document.createElement('th'); th.textContent = t; if (i) th.className = 'num'; hr.appendChild(th); });
  const body = tb.createTBody(); for (let i = n - 1; i >= 0; i--) { const r = body.insertRow(); r.insertCell().textContent = xl(i); S.forEach((s) => { const c = r.insertCell(); c.className = 'num'; c.textContent = fmt(s.values[i] || 0); }); }
  det.appendChild(tb); host.appendChild(det);
  let w0 = box.clientWidth; let tm = 0;
  const ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } if (Math.abs(box.clientWidth - w0) < 2) return; w0 = box.clientWidth; clearTimeout(tm); tm = setTimeout(draw, 60); });
  ro.observe(box);
  const mq = matchMedia('(prefers-color-scheme: dark)'); const re = () => { if (host.isConnected) draw(); else mq.removeEventListener('change', re); }; mq.addEventListener('change', re); // koyu/açık temaya geçince renkler
}

// Eski yardımcıyla aynı veri biçimi: [{ day, n }]
export const daySeries = (host, rows, { name = 'Toplam', color = 'var(--ch-1)', title, kind } = {}) => chart(host, { title: title || name, kind, labels: rows.map((r) => r.day), series: [{ name, color, values: rows.map((r) => r.n) }] });
