// Kamera yardımcıları: ön ve arka kamera arasında güvenli geçiş.
// Telefonların çoğunda iki kamera aynı anda açılamaz: önce açık olan kapatılır, sonra diğeri istenir.
// Çözünürlük yatay terimlerle istenir: telefonlar dik tutulunca görüntüyü kendileri çevirir (720×1280 gelir).
// Dikey (720×1280) ya da en-boy oranı (9:16) istemek, yatay algılayıcılı kameralarda görüntüyü kırpıp küçültüyordu:
// yakınlaşmış, bulanık ve karanlık görüntünün sebebi buydu.
export const WANT = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
// Kameranın kendi otomatik pozlama, beyaz dengesi ve odak ayarlarını açık tutar (destekleyen cihazlarda).
// dark: ortam karanlıksa pozlamayı biraz artırır.
export async function tuneTrack(t, { dark = false } = {}) {
  if (!t) return; try { t.contentHint = 'motion'; } catch { /* eski tarayıcı */ }
  const c = t.getCapabilities?.() || {}; const adv = {};
  for (const k of ['exposureMode', 'whiteBalanceMode', 'focusMode']) if (Array.isArray(c[k]) && c[k].includes('continuous')) adv[k] = 'continuous';
  if (dark && c.exposureCompensation && c.exposureCompensation.max > 0) adv.exposureCompensation = Math.min(c.exposureCompensation.max, Math.max(c.exposureCompensation.step || 0, c.exposureCompensation.max * 0.6));
  if (Object.keys(adv).length) await t.applyConstraints({ advanced: [adv] }).catch(() => {});
}
// Görüntünün ortalama parlaklığı (0-255). Ölçülemezse null.
export function lumaOf(video) {
  try { if (!video.videoWidth) return null; const c = document.createElement('canvas'); c.width = 32; c.height = 32; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; return s / (d.length / 4); } catch { return null; }
}
const BACK = /back|rear|arka|environment|world/i;
const FRONT = /front|ön|user|face|selfie/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// İstenen yöndeki kameradan tek bir görüntü izi açar. avoidId: az önce kapatılan kameranın kimliği.
export async function openCamera(facing = 'user', avoidId = '') {
  const md = navigator.mediaDevices; let err = null;
  const take = async (video) => {
    const s = await md.getUserMedia({ video }); const t = s.getVideoTracks()[0]; if (!t) throw new Error('Kamera bulunamadı'); tuneTrack(t);
    const got = t.getSettings?.().facingMode; // cihaz yönü bildiriyorsa ve yanlış kamera geldiyse kabul etme
    if (got && got !== facing) { t.stop(); throw new Error('Yanlış kamera'); }
    return t;
  };
  for (const video of [{ ...WANT, facingMode: { exact: facing } }, { facingMode: { exact: facing } }]) {
    for (let n = 0; n < 2; n++) {
      try { return await take(video); } catch (e) {
        err = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
        if (e.name !== 'NotReadableError' && e.name !== 'AbortError') break; // kamera henüz serbest kalmadıysa kısa bir bekleyip yeniden dene
        await wait(350);
      }
    }
  }
  // Yön bildirmeyen cihazlar: kamera listesinden adına bakarak ya da "öncekinden farklı olanı" seç
  try {
    const cams = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
    const named = cams.find((d) => (facing === 'environment' ? BACK : FRONT).test(d.label));
    const pick = named || (cams.length > 1 ? cams.find((d) => d.deviceId !== avoidId) : null);
    if (pick && pick.deviceId !== avoidId) { const s = await md.getUserMedia({ video: { ...WANT, deviceId: { exact: pick.deviceId } } }); const t = s.getVideoTracks()[0]; if (t) return t; }
  } catch (e) { err = e; }
  if (facing === 'user') { try { return (await md.getUserMedia({ video: WANT })).getVideoTracks()[0]; } catch (e) { err = e; } } // masaüstü: tek kamera
  throw err || new Error('Kamera açılamadı');
}

// Yayındaki akışın görüntü izini diğer kamerayla değiştirir. Dönen: { track, facing, ok }
// Diğer kamera açılamazsa eskisi geri açılır (ok: false), görüntü kaybolmaz.
export async function switchCamera(stream, to) {
  const old = stream.getVideoTracks()[0]; const from = to === 'user' ? 'environment' : 'user';
  const oldId = old?.getSettings?.().deviceId || '';
  if (old) { stream.removeTrack(old); old.stop(); await wait(120); }
  try { const track = await openCamera(to, oldId); stream.addTrack(track); return { track, facing: to, ok: true }; } catch {
    try { const track = await openCamera(from); stream.addTrack(track); return { track, facing: from, ok: false }; } catch { return { track: null, facing: from, ok: false }; }
  }
}
