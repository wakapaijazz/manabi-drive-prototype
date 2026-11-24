/* Original, procedural engine and feedback sounds. No sampled or remote assets. */
(function (root) {
  'use strict';

  const GEARS = [0, 11, 20, 31, 45, 62, 83];
  const QUIET = .0001;

  class DriveAudio {
    constructor() {
      this.enabled = true;
      this.context = null;
      this.nextUpdate = 0;
      this.boosting = false;
      this.active = false;
    }

    unlock() {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!this.enabled || !Context) return;
      try {
        if (!this.context) {
          this.context = new Context();
          this.buildEngine();
        }
        if (this.context.state !== 'running') this.context.resume().catch(() => {});
      } catch (_) {
        // The quiz still works in environments without audio output.
      }
    }

    buildEngine() {
      const ctx = this.context;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -13;
      limiter.ratio.value = 5;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? .56 : 0;
      this.master.connect(limiter).connect(ctx.destination);

      const length = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

      // An uneven firing order gives the exhaust a pulse and distinct overtones.
      const real = new Float32Array(25);
      const imaginary = new Float32Array(25);
      const pulses = [[0, 1], [.22, .76], [.46, .96], [.76, .63]];
      for (let harmonic = 1; harmonic < real.length; harmonic++) {
        for (const [phase, weight] of pulses) {
          const angle = harmonic * phase * Math.PI * 2;
          const magnitude = weight / (1 + harmonic * .7);
          real[harmonic] += Math.cos(angle) * magnitude;
          imaginary[harmonic] -= Math.sin(angle) * magnitude;
        }
      }

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = .85;
      this.motorLevel = ctx.createGain();
      this.motorLevel.gain.value = 0;
      this.filter.connect(this.motorLevel).connect(this.master);
      this.motor = ctx.createOscillator();
      this.motor.setPeriodicWave(ctx.createPeriodicWave(real, imaginary));
      this.motor.connect(this.filter);
      this.motor.start();
      this.rumble = ctx.createOscillator();
      this.rumble.type = 'triangle';
      const rumbleLevel = ctx.createGain();
      rumbleLevel.gain.value = .46;
      this.rumble.connect(rumbleLevel).connect(this.filter);
      this.rumble.start();

      const roadNoise = ctx.createBufferSource();
      roadNoise.buffer = this.noise;
      roadNoise.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.Q.value = .48;
      this.windLevel = ctx.createGain();
      this.windLevel.gain.value = 0;
      roadNoise.connect(this.windFilter).connect(this.windLevel).connect(this.master);
      roadNoise.start();
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (this.master) this.master.gain.setTargetAtTime(enabled ? .56 : 0, this.context.currentTime, .04);
    }

    update(speed, boost, active, vehicle = 'racer') {
      if (!this.motorLevel) return;
      const now = this.context.currentTime;
      const boosting = active && boost > .22;
      if (boosting && !this.boosting && this.enabled) this.boostSound(now);
      this.boosting = boosting;
      if (active === this.active && now < this.nextUpdate) return;
      this.active = active;
      this.nextUpdate = now + .03;

      let gear = 0;
      while (gear < GEARS.length - 2 && speed >= GEARS[gear + 1]) gear++;
      const revs = Math.min(1, (speed - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear]));
      const vehiclePitch = vehicle === 'bike' ? 1.36 : vehicle === 'truck' ? .72 : 1;
      const rpm = (26 + gear * 2.5 + 22 * revs + 8 * boost) * vehiclePitch;
      const load = Math.min(1, speed / 55);
      this.motor.frequency.setTargetAtTime(rpm, now, .055);
      this.rumble.frequency.setTargetAtTime(rpm * 1.98, now, .065);
      this.filter.frequency.setTargetAtTime(230 + revs * 430 + load * 390, now, .08);
      this.windFilter.frequency.setTargetAtTime(250 + 1000 * load, now, .1);
      this.motorLevel.gain.setTargetAtTime(active ? .065 + load * .085 + boost * .027 : 0, now, .075);
      this.windLevel.gain.setTargetAtTime(active ? .015 + load ** 1.5 * .17 : 0, now, .1);
    }

    tone(from, to, when, length, gain, type = 'sine', attack = .012) {
      const ctx = this.context;
      const osc = ctx.createOscillator();
      const volume = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, when);
      osc.frequency.exponentialRampToValueAtTime(to, when + length * .78);
      volume.gain.setValueAtTime(QUIET, when);
      volume.gain.exponentialRampToValueAtTime(gain, when + attack);
      volume.gain.exponentialRampToValueAtTime(QUIET, when + length);
      osc.connect(volume).connect(this.master);
      osc.start(when);
      osc.stop(when + length + .01);
    }

    air(from, to, when, length, gain, attack) {
      const ctx = this.context;
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = .85;
      filter.frequency.setValueAtTime(from, when);
      filter.frequency.exponentialRampToValueAtTime(to, when + length);
      const volume = ctx.createGain();
      volume.gain.setValueAtTime(QUIET, when);
      volume.gain.exponentialRampToValueAtTime(gain, when + attack);
      volume.gain.exponentialRampToValueAtTime(QUIET, when + length);
      source.connect(filter).connect(volume).connect(this.master);
      source.start(when);
      source.stop(when + length + .01);
    }

    feedback(correct) {
      if (!this.enabled || !this.master) return;
      const now = this.context.currentTime;
      if (!correct) {
        this.tone(138, 70, now, .29, .13, 'triangle');
        this.air(800, 170, now, .23, .11, .012);
        return;
      }
      // Short downbeat, followed by a wide, resolving chord.
      this.tone(122, 48, now, .24, .25, 'sine');
      this.air(3200, 710, now, .16, .16, .012);
      this.tone(293.66, 293.66, now + .02, .19, .13, 'triangle');
      this.tone(440, 440, now + .105, .21, .12, 'triangle');
      for (const [frequency, gain] of [[587.33, .14], [739.99, .095], [880, .07], [1174.66, .045]]) {
        this.tone(frequency, frequency, now + .19, .42, gain, 'triangle', .022);
      }
    }

    boostSound(now) {
      this.air(380, 3800, now, .66, .28, .12);
      this.tone(145, 440, now, .47, .13, 'triangle', .08);
      this.tone(410, 1240, now + .04, .55, .045, 'sine', .16);
    }
  }
  root.DriveAudio = DriveAudio;
})(window);
