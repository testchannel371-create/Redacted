// Synthesised sound effects (no audio files to download): gunshots per weapon class, hits, UI.
export class Sfx {
  constructor() { this.ctx = null; this.volume = 0.7; this.voices = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  // cat: weapon category; dist in metres (0 = you); pan -1..1
  shot(cat, { dist = 0, pan = 0, supp = false } = {}) {
    if (!this.ctx || this.voices > 22) return;
    const t = this.ctx.currentTime;
    const P = {
      pistol: [2200, 0.12, 0.7, 150], smg: [2600, 0.09, 0.55, 140], ar: [1800, 0.16, 0.8, 110],
      shotgun: [1100, 0.32, 1.0, 80], lmg: [1500, 0.18, 0.85, 95], sniper: [900, 0.5, 1.0, 60], marksman: [1300, 0.25, 0.9, 85],
    }[cat] || [1800, 0.15, 0.8, 110];
    let [freq, dec, vol, thump] = P;
    if (supp) { freq *= 0.45; vol *= 0.35; dec *= 0.6; }
    const att = 1 / (1 + dist / 14);
    if (att < 0.03) return;
    const cutoff = Math.max(400, freq * (dist > 0 ? Math.max(0.25, 1 - dist / 90) : 1));
    const out = this._out(vol * att, pan);
    this.voices++;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dec);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * 0.5, dec + 0.05);
    src.onended = () => { this.voices--; out.disconnect(); };
    if (dist < 40) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(thump * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(thump * 0.4, t + 0.12);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(supp ? 0.25 : 0.9, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + 0.16);
    }
  }

  tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  click(v = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.05);
  }

  hit(head) { this.tone(head ? 1900 : 1400, 0.05, 'square', 0.08); this.click(0.08); }
  kill() { this.tone(880, 0.08, 'triangle', 0.18); setTimeout(() => this.tone(1320, 0.14, 'triangle', 0.16), 70); }
  hurt() { this.tone(160, 0.2, 'sawtooth', 0.08, 0.5); }
  ui() { this.tone(520, 0.04, 'triangle', 0.06); }
  uiConfirm() { this.tone(660, 0.05, 'triangle', 0.08); setTimeout(() => this.tone(990, 0.08, 'triangle', 0.07), 50); }
  reload() { this.click(0.16); setTimeout(() => this.click(0.12), 260); setTimeout(() => this.click(0.2), 520); }
  dry() { this.click(0.2); }
  eliminated() { this.tone(110, 0.9, 'sawtooth', 0.12, 0.4); this.tone(82, 1.2, 'sine', 0.2, 0.5); }
  winner() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.14), i * 120)); }
}
