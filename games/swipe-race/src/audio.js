// Ses: motor (iki osilatör + süzgeç), lastik sesi (gürültü), kısa efektler. Hepsi WebAudio ile üretilir.
import { settings } from './core.js';

export class Sfx {
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = settings.mute ? 0 : 0.55; this.master.connect(c.destination);
    this.eGain = c.createGain(); this.eGain.gain.value = 0;
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 800; this.filt.Q.value = 2;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.o1.connect(this.filt); this.o2.connect(g2); g2.connect(this.filt);
    this.filt.connect(this.eGain); this.eGain.connect(this.master);
    this.o1.start(); this.o2.start();
    const len = c.sampleRate, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.sk = c.createBufferSource(); this.sk.buffer = nb; this.sk.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
    this.skGain = c.createGain(); this.skGain.gain.value = 0;
    this.sk.connect(bp); bp.connect(this.skGain); this.skGain.connect(this.master); this.sk.start();
  }
  engine(ratio, thr, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = [0, 0.16, 0.33, 0.52, 0.74, 1.3];
    let g = 0; while (g < 4 && ratio > gears[g + 1]) g++;
    const rpm = 0.3 + 0.7 * Math.min(1, (ratio - gears[g]) / (gears[g + 1] - gears[g]));
    const f = 48 + rpm * 115 + g * 9;
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filt.frequency.setTargetAtTime(350 + rpm * 1400 + thr * 700, t, 0.06);
    this.eGain.gain.setTargetAtTime(active ? 0.07 + thr * 0.07 : 0, t, 0.08);
  }
  skid(a) { if (this.ctx) this.skGain.gain.setTargetAtTime(Math.min(0.22, a), this.ctx.currentTime, 0.05); }
  beep(freq, dur = 0.15, type = 'sine', vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  item() { this.beep(523, 0.07, 'triangle', 0.14); setTimeout(() => this.beep(784, 0.07, 'triangle', 0.14), 60); setTimeout(() => this.beep(1047, 0.12, 'triangle', 0.14), 120); }
  whoosh() { this.thud(0.25); this.beep(220, 0.35, 'sawtooth', 0.08); }
  coin() { this.beep(988, 0.08, 'square', 0.12); setTimeout(() => this.beep(1319, 0.14, 'square', 0.12), 70); }
  thud(v) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(Math.min(0.6, v), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5, 0.3);
  }
  setMute(m) { if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
}
export const sfx = new Sfx();
