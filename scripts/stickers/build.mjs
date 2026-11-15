// Sohbet çıkartmaları: her paket için vektör karakterler üretir (public/img/stk/<paket>/<çıkartma>.svg).
// Ücretli paketler CSS animasyonludur (img içinde de oynar), ücretsiz paket durağandır.
// Çalıştır: node scripts/stickers/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PACKS } from '../../server/stickers-data.js';

const OUT = path.resolve('public/img/stk');
const INK = '#2b2233';

// ---------- gövdeler (160×160) ----------
const BODY = {
  mochi: { d: 'M30 98 C30 60 52 40 80 40 C108 40 130 60 130 98 C130 124 110 134 80 134 C50 134 30 124 30 98Z', face: [80, 84] },
  heart: { d: 'M80 136 C42 112 22 88 22 66 C22 45 37 33 54 33 C66 33 75 40 80 50 C85 40 94 33 106 33 C123 33 138 45 138 66 C138 88 118 112 80 136Z', face: [80, 78] },
};
const heartPath = (x, y, s) => `M${x} ${y + 3.2 * s} C${x - 4.2 * s} ${y + 0.6 * s} ${x - 5.4 * s} ${y - 1.4 * s} ${x - 5.4 * s} ${y - 2.8 * s} C${x - 5.4 * s} ${y - 4.6 * s} ${x - 3.9 * s} ${y - 5.6 * s} ${x - 2.6 * s} ${y - 5.6 * s} C${x - 1.4 * s} ${y - 5.6 * s} ${x - 0.5 * s} ${y - 4.8 * s} ${x} ${y - 3.8 * s} C${x + 0.5 * s} ${y - 4.8 * s} ${x + 1.4 * s} ${y - 5.6 * s} ${x + 2.6 * s} ${y - 5.6 * s} C${x + 3.9 * s} ${y - 5.6 * s} ${x + 5.4 * s} ${y - 4.6 * s} ${x + 5.4 * s} ${y - 2.8 * s} C${x + 5.4 * s} ${y - 1.4 * s} ${x + 4.2 * s} ${y + 0.6 * s} ${x} ${y + 3.2 * s}Z`;
const star4 = (x, y, r) => `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;
const star5 = (x, y, r) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; p += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; } return p + 'Z'; };

// ---------- yüz ----------
function eye(kind, x, y) {
  switch (kind) {
    case 'happy': return `<path d="M${x - 6} ${y + 2} Q${x} ${y - 6} ${x + 6} ${y + 2}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`;
    case 'closed': return `<path d="M${x - 6} ${y} Q${x} ${y + 5} ${x + 6} ${y}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'heart': return `<path d="${heartPath(x, y + 1, 1.7)}" fill="#ff3d6e"/><circle cx="${x - 3}" cy="${y - 4}" r="1.6" fill="#fff" opacity=".9"/>`;
    case 'star': return `<path d="${star5(x, y, 8)}" fill="#ffc83d" stroke="#e59a00" stroke-width="1.2" stroke-linejoin="round"/>`;
    case 'wide': return `<circle cx="${x}" cy="${y}" r="8.5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y + 1}" r="5" fill="${INK}"/><circle cx="${x - 1.8}" cy="${y - 1.2}" r="1.8" fill="#fff"/>`;
    case 'teary': return `<ellipse cx="${x}" cy="${y}" rx="6" ry="7.2" fill="${INK}"/><circle cx="${x - 2}" cy="${y - 2.6}" r="2.2" fill="#fff"/><circle cx="${x + 2}" cy="${y + 2.4}" r="1.2" fill="#fff"/><path d="M${x - 7} ${y + 6} Q${x} ${y + 9} ${x + 7} ${y + 6}" fill="none" stroke="#7cc8ff" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'angry': return `<ellipse cx="${x}" cy="${y + 1}" rx="4.6" ry="5.6" fill="${INK}"/><circle cx="${x - 1.4}" cy="${y - 1}" r="1.4" fill="#fff"/>`;
    case 'glasses': return '';
    default: return `<ellipse cx="${x}" cy="${y}" rx="5" ry="6.4" fill="${INK}"/><circle cx="${x - 1.6}" cy="${y - 2.2}" r="1.9" fill="#fff"/>`;
  }
}
function eyes(kind, fx, fy) {
  const L = fx - 18; const R = fx + 18;
  if (kind === 'wink') return eye('dot', L, fy) + eye('happy', R, fy);
  if (kind === 'glasses') return `<g><path d="M${L - 13} ${fy - 6} H${R + 13} V${fy - 2} H${R + 11} Q${R + 10} ${fy + 9} ${R} ${fy + 9} Q${R - 10} ${fy + 9} ${R - 11} ${fy - 2} H${L + 11} Q${L + 10} ${fy + 9} ${L} ${fy + 9} Q${L - 10} ${fy + 9} ${L - 11} ${fy - 2} H${L - 13}Z" fill="${INK}"/><path d="M${L - 7} ${fy - 3} l5 0 l-6 7z M${R - 7} ${fy - 3} l5 0 l-6 7z" fill="#fff" opacity=".55"/></g>`;
  let s = eye(kind, L, fy) + eye(kind, R, fy);
  if (kind === 'angry') s += `<path d="M${L - 8} ${fy - 11} L${L + 5} ${fy - 6} M${R + 8} ${fy - 11} L${R - 5} ${fy - 6}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
  return s;
}
function mouth(kind, x, y) {
  switch (kind) {
    case 'open': return `<path d="M${x - 9} ${y - 1} Q${x} ${y + 15} ${x + 9} ${y - 1}Z" fill="${INK}"/><path d="M${x - 5} ${y + 7} Q${x} ${y + 3} ${x + 5} ${y + 7} Q${x} ${y + 11} ${x - 5} ${y + 7}Z" fill="#ff7a93"/>`;
    case 'grin': return `<path d="M${x - 12} ${y - 2} Q${x} ${y + 16} ${x + 12} ${y - 2}Z" fill="${INK}"/><path d="M${x - 10} ${y - 1.5} H${x + 10} Q${x + 9} ${y + 2.5} ${x + 7.5} ${y + 3} H${x - 7.5} Q${x - 9} ${y + 2.5} ${x - 10} ${y - 1.5}Z" fill="#fff"/><path d="M${x - 6} ${y + 9} Q${x} ${y + 5} ${x + 6} ${y + 9} Q${x} ${y + 13} ${x - 6} ${y + 9}Z" fill="#ff7a93"/>`;
    case 'o': return `<ellipse cx="${x}" cy="${y + 2}" rx="4.4" ry="5.4" fill="${INK}"/>`;
    case 'frown': return `<path d="M${x - 7} ${y + 5} Q${x} ${y - 2} ${x + 7} ${y + 5}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'kiss': return `<path d="M${x - 2} ${y - 5} Q${x + 6} ${y - 3} ${x + 1} ${y} Q${x + 6} ${y + 3} ${x - 2} ${y + 5}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'cat': return `<path d="M${x - 9} ${y} Q${x - 4.5} ${y + 6} ${x} ${y} Q${x + 4.5} ${y + 6} ${x + 9} ${y}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'flat': return `<path d="M${x - 7} ${y + 2} H${x + 7}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'beak': return `<path d="M${x - 7} ${y - 1} Q${x} ${y - 6} ${x + 7} ${y - 1} Q${x} ${y + 8} ${x - 7} ${y - 1}Z" fill="#ff9a2e" stroke="#e0701a" stroke-width="1.4" stroke-linejoin="round"/>`;
    default: return `<path d="M${x - 7} ${y} Q${x} ${y + 8} ${x + 7} ${y}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
  }
}

// ---------- süsler ----------
const EXTRA = {
  hearts: () => [[118, 46, 1.5, 0], [134, 70, 1.1, 0.5], [104, 30, 0.9, 1]].map(([x, y, s, d]) => `<path class="fl" style="animation-delay:${d}s" d="${heartPath(x, y, s * 2.4)}" fill="#ff4f7b" stroke="#fff" stroke-width="1.6"/>`).join(''),
  zzz: () => [[112, 44, 9, 0], [126, 30, 7, 0.6], [138, 18, 5, 1.2]].map(([x, y, s, d]) => `<path class="fl" style="animation-delay:${d}s" d="M${x - s} ${y - s} H${x + s} L${x - s} ${y + s} H${x + s}" fill="none" stroke="#7a6cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join(''),
  tears: (fx, fy) => [fx - 22, fx + 22].map((x, i) => `<path class="drip" style="animation-delay:${i * 0.35}s" d="M${x} ${fy + 8} Q${x - 4} ${fy + 16} ${x} ${fy + 19} Q${x + 4} ${fy + 16} ${x} ${fy + 8}Z" fill="#7cc8ff" stroke="#fff" stroke-width="1.2"/>`).join(''),
  sparkle: () => [[34, 40, 8, 0], [128, 34, 10, 0.4], [140, 96, 6, 0.8], [22, 92, 6, 1.1]].map(([x, y, r, d]) => `<path class="tw" style="animation-delay:${d}s" d="${star4(x, y, r)}" fill="#ffd34d"/>`).join(''),
  anger: () => `<g class="pu"><path d="M118 38 q6 6 0 12 M128 34 q-6 6 0 12 M112 46 q6 -6 12 0 M114 56 q6 -6 12 0" fill="none" stroke="#ff3b4e" stroke-width="3.6" stroke-linecap="round"/></g>`,
  sweat: () => `<path class="drip" d="M126 52 Q120 62 126 66 Q132 62 126 52Z" fill="#8fd3ff" stroke="#fff" stroke-width="1.2"/>`,
  blush: (fx, fy) => `<ellipse cx="${fx - 30}" cy="${fy + 12}" rx="9" ry="5" fill="#ff5f86" opacity=".55"/><ellipse cx="${fx + 30}" cy="${fy + 12}" rx="9" ry="5" fill="#ff5f86" opacity=".55"/><path d="M${fx - 36} ${fy + 9} l3 6 M${fx - 31} ${fy + 9} l3 6 M${fx + 26} ${fy + 9} l3 6 M${fx + 31} ${fy + 9} l3 6" stroke="#e23d66" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
  confetti: () => [[30, 26, '#ff4f7b', 0, 20], [56, 14, '#3dc6ff', 0.3, -30], [104, 18, '#ffd34d', 0.6, 40], [130, 30, '#7a6cff', 0.15, -15], [80, 8, '#3fd69a', 0.45, 60], [146, 54, '#ff9a2e', 0.75, 10], [16, 58, '#ffd34d', 0.9, -45]].map(([x, y, c, d, r]) => `<rect class="cf" style="animation-delay:${d}s" x="${x - 3}" y="${y - 5}" width="6" height="10" rx="1.5" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join(''),
  notes: () => [[122, 44, 0], [138, 70, 0.7], [26, 50, 1.2]].map(([x, y, d]) => `<g class="fl" style="animation-delay:${d}s"><path d="M${x} ${y} V${y - 16} L${x + 10} ${y - 19} V${y - 4}" fill="none" stroke="#7a6cff" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="${x - 3}" cy="${y}" rx="4" ry="3.2" fill="#7a6cff"/><ellipse cx="${x + 7}" cy="${y - 4}" rx="4" ry="3.2" fill="#7a6cff"/></g>`).join(''),
  wave: (c) => `<g class="wv"><path d="M116 98 Q134 88 136 66" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/><path d="M116 98 Q134 88 136 66" fill="none" stroke="${c.edge}" stroke-width="17" stroke-linecap="round"/><path d="M116 98 Q134 88 136 66" fill="none" stroke="${c.b2}" stroke-width="12" stroke-linecap="round"/><circle cx="136" cy="62" r="10" fill="${c.b1}" stroke="${c.edge}" stroke-width="2.6"/><path d="M131 55 v-5 M136 53 v-6 M141 55 v-5" stroke="${c.edge}" stroke-width="2.4" stroke-linecap="round"/></g>`,
  thumb: (c) => `<g class="bob"><rect x="118" y="88" width="26" height="24" rx="8" fill="${c.b1}" stroke="${c.edge}" stroke-width="2.4"/><path d="M124 90 V72 Q124 64 131 66 Q134 67 134 74 V88" fill="${c.b1}" stroke="${c.edge}" stroke-width="2.4" stroke-linejoin="round"/><path d="M121 98 H140 M121 105 H140" stroke="${c.edge}" stroke-width="1.8" stroke-linecap="round" opacity=".6"/></g>`,
  flower: () => `<g class="bob"><path d="M132 120 Q130 100 134 82" stroke="#3fae5a" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M132 106 q-10 -4 -12 -12 q10 0 12 8" fill="#55c46d"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="134" cy="72" rx="6" ry="10" fill="#ff6f9c" stroke="#fff" stroke-width="1.4" transform="rotate(${a} 134 82)"/>`).join('')}<circle cx="134" cy="82" r="5.5" fill="#ffd34d"/></g>`,
  letter: () => `<g class="bob"><rect x="104" y="88" width="46" height="32" rx="5" fill="#fff8ec" stroke="#e8b979" stroke-width="2.4" transform="rotate(-10 127 104)"/><path d="M106 92 L127 106 L148 88" fill="none" stroke="#e8b979" stroke-width="2.4" stroke-linejoin="round" transform="rotate(-10 127 104)"/><path d="${heartPath(127, 106, 1.6)}" fill="#ff4f7b" transform="rotate(-10 127 104)"/></g>`,
  crack: () => `<path class="pu" d="M80 50 L72 70 L86 82 L74 100 L82 118" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`,
  cake: () => `<g class="bob"><rect x="108" y="100" width="40" height="22" rx="5" fill="#ffd9e6" stroke="#e98fb0" stroke-width="2.2"/><path d="M108 106 q5 6 10 0 q5 6 10 0 q5 6 10 0 q5 6 10 0" fill="none" stroke="#e98fb0" stroke-width="2.2"/><rect x="126" y="86" width="4" height="14" rx="2" fill="#7a6cff"/><path class="tw" d="M128 74 q5 6 0 11 q-5 -5 0 -11Z" fill="#ff9a2e"/></g>`,
  balloon: () => `<g class="fl2"><path d="M136 70 Q130 92 138 118" fill="none" stroke="#b9a7c8" stroke-width="1.8"/><ellipse cx="136" cy="50" rx="15" ry="19" fill="#ff4f7b" stroke="#fff" stroke-width="2"/><path d="M130 40 q3 -6 8 -6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/><path d="M133 69 h6 l-3 4z" fill="#ff4f7b"/></g>`,
  hat: () => `<g><path d="M66 46 L80 4 L94 46Z" fill="#7a6cff" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M71 32 L89 32 M68 40 L92 40 M75 20 L85 20" stroke="#ffd34d" stroke-width="3.4"/><circle class="tw" cx="80" cy="5" r="6" fill="#ff4f7b" stroke="#fff" stroke-width="2"/></g>`,
  tuft: () => `<path d="M76 42 Q72 28 80 26 M80 42 Q82 26 90 30" fill="none" stroke="#e6a400" stroke-width="3.4" stroke-linecap="round"/>`,
  crown: () => `<g><path d="M56 46 L58 20 L70 32 L80 14 L90 32 L102 20 L104 46Z" fill="#ffd34d" stroke="#d99a00" stroke-width="2.4" stroke-linejoin="round"/><circle cx="80" cy="34" r="4" fill="#ff4f7b"/><circle cx="64" cy="38" r="3" fill="#3dc6ff"/><circle cx="96" cy="38" r="3" fill="#3fd69a"/><path class="tw" d="${star4(104, 14, 6)}" fill="#fff"/></g>`,
  coins: () => [[30, 24, 0], [62, 6, 0.4], [104, 16, 0.8], [134, 30, 0.2], [148, 64, 0.6]].map(([x, y, d]) => `<g class="cf" style="animation-delay:${d}s"><circle cx="${x}" cy="${y}" r="7.5" fill="#ffd34d" stroke="#d99a00" stroke-width="2"/><path d="M${x} ${y - 3.5} V${y + 3.5}" stroke="#d99a00" stroke-width="2" stroke-linecap="round"/></g>`).join(''),
  stripes: () => `<path d="M68 46 q4 8 0 14 M80 42 q4 9 0 16 M92 46 q4 8 0 14" fill="none" stroke="#e0742a" stroke-width="3.6" stroke-linecap="round" opacity=".7"/>`,
  question: () => `<path class="pu" d="M120 40 q0 -12 11 -12 q11 0 11 10 q0 7 -9 10 v6" fill="none" stroke="#7a6cff" stroke-width="4.2" stroke-linecap="round"/><circle cx="133" cy="64" r="2.8" fill="#7a6cff"/>`,
};

const CAT_EARS = (c) => `<path d="M38 70 L44 30 L72 48Z M122 70 L116 30 L88 48Z" fill="url(#g)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="M38 70 L44 30 L72 48Z M122 70 L116 30 L88 48Z" fill="url(#g)" stroke="${c.edge}" stroke-width="3" stroke-linejoin="round"/><path d="M47 54 L49 38 L62 47Z M113 54 L111 38 L98 47Z" fill="#ffb3c4"/>`;
const CAT_TAIL = (c) => `<path class="tl" d="M122 122 C148 120 154 92 140 80" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path class="tl" d="M122 122 C148 120 154 92 140 80" fill="none" stroke="${c.b2}" stroke-width="12" stroke-linecap="round"/>`;
const WHISK = (fx, fy) => `<path d="M${fx - 34} ${fy + 14} L${fx - 50} ${fy + 10} M${fx - 34} ${fy + 19} L${fx - 50} ${fy + 21} M${fx + 34} ${fy + 14} L${fx + 50} ${fy + 10} M${fx + 34} ${fy + 19} L${fx + 50} ${fy + 21}" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
const WINGS = (c) => `<path class="wv" d="M34 100 Q14 92 18 74 Q30 84 40 86Z" fill="${c.b2}" stroke="${c.edge}" stroke-width="2.4" stroke-linejoin="round"/><path class="wv2" d="M126 100 Q146 92 142 74 Q130 84 120 86Z" fill="${c.b2}" stroke="${c.edge}" stroke-width="2.4" stroke-linejoin="round"/>`;

const CSS = `
.b{transform-box:fill-box;transform-origin:50% 100%}
.bounce .b{animation:bo 1.1s ease-in-out infinite}@keyframes bo{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(0) scale(1.06,.92)}50%{transform:translateY(-10px) scale(.97,1.04)}85%{transform:translateY(0) scale(1.04,.95)}}
.jump .b{animation:ju .9s cubic-bezier(.3,0,.4,1) infinite}@keyframes ju{0%,100%{transform:translateY(0) scale(1.08,.9)}45%{transform:translateY(-18px) scale(.94,1.08)}70%{transform:translateY(-2px)}}
.wobble .b{animation:wo 1.6s ease-in-out infinite}@keyframes wo{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.shake .b{animation:sh .45s linear infinite}@keyframes sh{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px) rotate(-2deg)}75%{transform:translateX(4px) rotate(2deg)}}
.pulse .b{animation:pl 1s ease-in-out infinite}@keyframes pl{0%,100%{transform:scale(1)}30%{transform:scale(1.07)}45%{transform:scale(.98)}60%{transform:scale(1.04)}}
.breathe .b{animation:br 2.8s ease-in-out infinite}@keyframes br{0%,100%{transform:scale(1,1)}50%{transform:scale(1.04,.97)}}
.float .b{animation:fo 2.2s ease-in-out infinite}@keyframes fo{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.e{transform-box:fill-box;transform-origin:50% 50%;animation:bl 3.4s infinite}@keyframes bl{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}
.fl{animation:fl 2.2s ease-out infinite;opacity:0}@keyframes fl{0%{transform:translateY(10px);opacity:0}25%{opacity:1}100%{transform:translateY(-22px);opacity:0}}
.fl2{animation:fo 2.4s ease-in-out infinite}
.tw{transform-box:fill-box;transform-origin:50% 50%;animation:tw 1.4s ease-in-out infinite}@keyframes tw{0%,100%{transform:scale(.4);opacity:.3}50%{transform:scale(1.15);opacity:1}}
.pu{transform-box:fill-box;transform-origin:50% 50%;animation:pu .7s ease-in-out infinite}@keyframes pu{0%,100%{transform:scale(.85)}50%{transform:scale(1.12)}}
.drip{transform-box:fill-box;transform-origin:50% 0;animation:dr 1.3s ease-in infinite}@keyframes dr{0%{transform:translateY(-4px) scale(.4);opacity:0}30%{opacity:1}100%{transform:translateY(16px) scale(1);opacity:0}}
.cf{transform-box:fill-box;transform-origin:50% 50%;animation:cf 1.8s linear infinite}@keyframes cf{0%{transform:translateY(-14px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translateY(46px) rotate(260deg);opacity:0}}
.wv{transform-box:view-box;transform-origin:116px 98px;animation:wv .8s ease-in-out infinite alternate}@keyframes wv{from{transform:rotate(-14deg)}to{transform:rotate(16deg)}}
.wv2{transform-box:view-box;transform-origin:126px 100px;animation:wv .8s ease-in-out infinite alternate-reverse}
.bob{transform-box:fill-box;transform-origin:50% 100%;animation:bb 1s ease-in-out infinite}@keyframes bb{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-5px) rotate(4deg)}}
.tl{transform-box:view-box;transform-origin:122px 122px;animation:tl 1.6s ease-in-out infinite alternate}@keyframes tl{from{transform:rotate(-6deg)}to{transform:rotate(8deg)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;opacity:1!important}}`;

function sticker(pack, it) {
  const c = pack.colors;
  const B = BODY[pack.body === 'heart' ? 'heart' : 'mochi'];
  const [fx, fy] = B.face;
  const ex = (it.extras || []).map((k) => [k, EXTRA[k]]);
  const call = (k, f) => (['wave', 'thumb'].includes(k) ? f(c) : f(fx, fy, c));
  const behindArm = ex.filter(([k]) => ['wave', 'balloon'].includes(k)).map(([k, f]) => call(k, f)).join('');
  const over = ex.filter(([k]) => ['zzz', 'notes', 'hearts', 'sparkle', 'confetti', 'coins', 'question', 'anger'].includes(k)).map(([k, f]) => call(k, f)).join('');
  const onBody = ex.filter(([k]) => !['wave', 'balloon', 'zzz', 'notes', 'hearts', 'sparkle', 'confetti', 'coins', 'question', 'anger'].includes(k)).map(([k, f]) => call(k, f)).join('');
  const top = pack.body === 'cat' ? CAT_EARS(c) : '';
  const tail = pack.body === 'cat' ? CAT_TAIL(c) : '';
  const deco = (pack.body === 'cat' ? EXTRA.stripes() : '') + (pack.body === 'chick' ? EXTRA.tuft() : '') + (pack.body === 'gold' ? EXTRA.crown() : '') + (pack.body === 'chick' && it.hat ? EXTRA.hat() : '');
  const wings = pack.body === 'chick' ? WINGS(c) : '';
  const blink = !['closed', 'happy', 'heart', 'star', 'glasses', 'wink'].includes(it.eyes) && pack.animated;
  const cheeks = it.extras?.includes('blush') ? '' : `<ellipse cx="${fx - 30}" cy="${fy + 12}" rx="8" ry="4.6" fill="#ff7a9c" opacity=".38"/><ellipse cx="${fx + 30}" cy="${fy + 12}" rx="8" ry="4.6" fill="#ff7a9c" opacity=".38"/>`;
  const whisk = pack.body === 'cat' ? WHISK(fx, fy) : '';
  const mouthKind = pack.body === 'chick' && !it.mouth ? 'beak' : it.mouth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.b1}"/><stop offset="1" stop-color="${c.b2}"/></linearGradient>
<radialGradient id="h" cx=".35" cy=".25" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${pack.animated ? `<style>${CSS}</style>` : ''}
<g class="${pack.animated ? it.anim || 'bounce' : ''}">
<ellipse cx="80" cy="146" rx="42" ry="6" fill="#000" opacity=".12"/>
${behindArm}
<g class="b">
${tail}${wings}${top}
<path d="${B.d}" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>
<path d="${B.d}" fill="url(#g)" stroke="${c.edge}" stroke-width="3" stroke-linejoin="round"/>
<path d="${B.d}" fill="url(#h)"/>
${deco}
<g${blink ? ' class="e"' : ''}>${eyes(it.eyes, fx, fy)}</g>
${cheeks}${whisk}
${mouth(mouthKind, fx, fy + 18)}
${onBody}
</g>
${over}
</g></svg>`;
  return svg.replace(/\n+/g, '\n');
}

let n = 0;
for (const p of PACKS) {
  const dir = path.join(OUT, p.id); fs.mkdirSync(dir, { recursive: true });
  for (const it of p.items) { fs.writeFileSync(path.join(dir, `${it.id}.svg`), sticker(p, it)); n++; }
}
console.log(`${n} çıkartma yazıldı → ${OUT}`);
