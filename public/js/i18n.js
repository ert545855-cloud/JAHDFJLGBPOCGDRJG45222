// Dil seçeneği: arayüz metinleri ekrana gelirken seçilen dile çevrilir (Türkçe varsayılan).
// Sözlükte olmayan metin olduğu gibi kalır; kullanıcı içerikleri (gönderi, mesaj) çevrilmez.
export const LANGS = [['tr', 'Türkçe', '🇹🇷'], ['en', 'English', '🇬🇧'], ['de', 'Deutsch', '🇩🇪']];
let lang = 'tr';
try { lang = localStorage.getItem('su_lang') || 'tr'; } catch {}
export const getLang = () => lang;
let dict = null; let pats = []; let fb = null; let fbPats = []; // fb: eksik çeviride yedek dil (Almanca → İngilizce)
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const SKIP = 'script,style,textarea,.mwrap .msg,.cap,.ctext,.bio,.tp-t,.post-h .u,.n,.u,.vw-h b,.pq-quote,.cmt,.stk,.ov,.genel .bubble,.ly,.ks-title,.ks-meta b,.ks-set h2,.kr-pick b,.kr-pick small,[data-noi18n]';

function tr(s) {
  if (!dict || !s) return null;
  const k = norm(s);
  if (!k || !/[a-zçğıöşü]/i.test(k)) return null;
  if (dict[k] != null) return dict[k];
  for (const [re, fn] of pats) { const m = k.match(re); if (m) return typeof fn === 'function' ? fn(...m) : k.replace(re, fn); }
  if (fb) {
    if (fb[k] != null) return fb[k];
    for (const [re, fn] of fbPats) { const m = k.match(re); if (m) return typeof fn === 'function' ? fn(...m) : k.replace(re, fn); }
  }
  return null;
}
export const t = (s) => (lang === 'tr' ? s : tr(s) ?? s);

// Çevirdiğimiz metni bir daha çevirme (çeviri başka bir anahtara denk gelirse döngüye girmesin)
const done = new WeakMap();
function fixText(n) {
  const v = n.nodeValue; if (done.get(n) === v) return;
  const out = tr(v);
  if (out == null || out === norm(v)) return;
  const lead = v.match(/^\s*/)[0]; const trail = v.match(/\s*$/)[0];
  n.nodeValue = lead + out + trail; done.set(n, n.nodeValue);
}
function fixEl(el) {
  for (const a of ['placeholder', 'aria-label', 'title']) {
    const v = el.getAttribute?.(a); if (!v) continue;
    const mark = `${a}:${v}`; const seen = done.get(el);
    if (seen && seen.has(mark)) continue; // kendi yazdığımız çeviri: tekrar çevirme
    const out = tr(v);
    if (out != null && out !== v) { el.setAttribute(a, out); (seen || done.set(el, new Set()).get(el)).add(`${a}:${out}`); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { if (!root.parentElement?.closest(SKIP)) fixText(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  fixEl(root);
  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(fixEl);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n; while ((n = w.nextNode())) fixText(n);
}

export async function initI18n() {
  if (lang === 'tr') return;
  try {
    const [m, e] = await Promise.all([import(`/i18n/${lang}.js`), lang !== 'en' ? import('/i18n/en.js') : null]);
    dict = m.default; pats = m.patterns || [];
    if (e) { fb = e.default; fbPats = e.patterns || []; }
  } catch (e) { console.warn('[i18n]', e); return; }
  document.documentElement.lang = lang;
  walk(document.body);
  const mo = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'characterData') { if (!r.target.parentElement?.closest(SKIP)) fixText(r.target); continue; }
      if (r.type === 'attributes') { fixEl(r.target); continue; }
      r.addedNodes.forEach(walk);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
  const orig = window.confirm.bind(window);
  window.confirm = (s) => orig(t(String(s)));
}
export function setLang(l) {
  try { localStorage.setItem('su_lang', l); } catch {}
  location.reload();
}
