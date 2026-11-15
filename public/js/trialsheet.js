// Yeni üyeye SwipeUp+ denemesi tanıtımı (bir kez gösterilir)
import { sheet } from './core.js';
import { icon } from './icons.js';
import { stickerHtml } from './stickers.js';

export default function trialSheet(tr) {
  const k = 'su_trial_seen_' + (tr.at || tr.until);
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { return; }
  const left = Math.max(1, Math.ceil((tr.until - Date.now()) / 86400000));
  sheet(null, `<div class="trial-sh">
    <div class="trial-art">${stickerHtml({ pack: 'altin', id: 'selam', name: '' }, 120)}</div>
    <h2>${left} gün SwipeUp+ senden yana</h2>
    <p class="muted">Hoş geldin hediyesi. Kart bilgisi yok, süre bitince kendiliğinden ücretsiz plana dönersin.</p>
    <ul class="perks compact">
      <li>${icon('heart')}<span>Sınırsız beğeni</span></li>
      <li>${icon('eye')}<span>Seni beğenenleri gör</span></li>
      <li>${icon('undo')}<span>Son kaydırmanı geri al</span></li>
      <li>${icon('star')}<span>Daha fazla süper beğeni</span></li>
      <li>${icon('sticker')}<span>Altın Seri hareketli çıkartmalar</span></li>
    </ul>
    <button class="btn primary block go">Keşfetmeye başla</button>
  </div>`, { onMount(sh, close) { sh.querySelector('.go').onclick = close; } });
}
