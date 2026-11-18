// One job: synthesise all sound at runtime with Web Audio. There are no audio
// files and no network fetches — engines, guns, sirens, footsteps and a loop.

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.sirenGain = null;
    this.sirenOsc = null;
    this.noise = null;
    this.musicStep = 0;
    this.musicTimer = 0;
    this.footTimer = 0;
    this.muted = false;
  }

  // Must be called from a user gesture (the Enter that starts the game).
  start() {
    if (this.ctx) return;
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // A single reusable second of white noise for bursts and impacts.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff) - 1;
    }
    this.noise = buf;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 720;
    this.engineGain.connect(filter); filter.connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 70;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square'; this.engineSub.frequency.value = 35;
    const subGain = ctx.createGain(); subGain.gain.value = 0.35;
    this.engineOsc.connect(this.engineGain);
    this.engineSub.connect(subGain); subGain.connect(this.engineGain);
    this.engineOsc.start(); this.engineSub.start();

    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sawtooth'; this.sirenOsc.frequency.value = 460;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass'; sirenFilter.frequency.value = 900; sirenFilter.Q.value = 3;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(sirenFilter); sirenFilter.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  burst(duration, volume, frequency, type = 'bandpass', decay = 0.9) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration * decay);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(now); src.stop(now + duration);
  }

  tone(frequency, duration, volume, type = 'triangle') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain); gain.connect(this.master);
    osc.start(now); osc.stop(now + duration + 0.02);
  }

  // Continuous sounds, refreshed every frame from the world state.
  update(world, dt) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const car = world.player.car;
    const speed = car ? Math.abs(car.speed) : 0;
    const rpm = 65 + speed * 5.5 + (car ? Math.abs(car.ctrl.throttle) * 45 : 0);
    this.engineOsc.frequency.setTargetAtTime(rpm, now, 0.08);
    this.engineSub.frequency.setTargetAtTime(rpm * 0.5, now, 0.08);
    this.engineGain.gain.setTargetAtTime(car && !car.dead ? 0.10 : 0.012, now, 0.12);

    const cops = world.police.some(c => !c.dead && Math.hypot(c.x - world.player.x, c.z - world.player.z) < 120);
    this.sirenGain.gain.setTargetAtTime(cops ? 0.055 : 0, now, 0.2);
    if (cops) this.sirenOsc.frequency.setTargetAtTime(420 + 180 * (0.5 + 0.5 * Math.sin(world.time * 7)), now, 0.03);

    this.footTimer -= dt;
    if (!car && Math.hypot(world.player.vx, world.player.vz) > 2 && this.footTimer <= 0) {
      this.footTimer = 0.28;
      this.burst(0.06, 0.09, 260, 'lowpass');
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.26;
      this.playMusicStep();
    }
  }

  // A small original loop: sunlit major arpeggio over a slow bass pulse.
  playMusicStep() {
    const scale = [220, 277, 330, 415, 330, 277, 247, 294];
    const bass = [110, 110, 131, 98];
    const step = this.musicStep++;
    this.tone(scale[step % scale.length], 0.24, 0.045, 'triangle');
    if (step % 4 === 0) this.tone(bass[(step / 4) % 4 | 0], 0.5, 0.06, 'sine');
    if (step % 8 === 6) this.tone(scale[(step + 2) % scale.length] * 2, 0.16, 0.028, 'triangle');
  }

  // Drain the one-frame sound-event queue produced by the simulation.
  consume(events) {
    if (!this.ctx) { events.length = 0; return; }
    for (const name of events) {
      switch (name) {
        case 'shot':   this.burst(0.10, 0.32, 1500, 'highpass'); break;
        case 'boom':   this.burst(0.24, 0.36, 700, 'lowpass'); break;
        case 'explosion': this.burst(0.6, 0.5, 380, 'lowpass'); break;
        case 'crash':  this.burst(0.3, 0.35, 500, 'lowpass'); break;
        case 'hurt':   this.tone(150, 0.18, 0.16, 'sawtooth'); break;
        case 'dry':    this.tone(900, 0.05, 0.06, 'square'); break;
        case 'swing':  this.burst(0.08, 0.1, 900, 'bandpass'); break;
        case 'reload': this.burst(0.07, 0.12, 1800, 'bandpass'); break;
        case 'beep':   this.tone(880, 0.12, 0.09, 'square'); break;
        case 'cash':   this.tone(1320, 0.35, 0.1, 'triangle'); break;
        case 'fail':   this.tone(180, 0.4, 0.12, 'sawtooth'); break;
        case 'enter':  this.tone(520, 0.12, 0.08, 'triangle'); break;
        case 'sirenOff': break;
      }
    }
    events.length = 0;
  }
}
