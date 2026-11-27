// The city's sound, made in the browser with Web Audio, so no file is downloaded. It is built only after a
// visitor presses Sound, because browsers refuse to play audio before a click. The levels come from mix.js.
function noiseBuffer(ctx, brown) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

export function createSoundscape() {
  const ctx = new window.AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const layer = (source, filter) => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    return gain;
  };
  const filter = (type, frequency, Q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  };

  const hum = ctx.createBufferSource();
  hum.buffer = noiseBuffer(ctx, true);
  hum.loop = true;
  const humGain = layer(hum, filter('lowpass', 300));

  const rain = ctx.createBufferSource();
  rain.buffer = noiseBuffer(ctx, false);
  rain.loop = true;
  const rainGain = layer(rain, filter('bandpass', 2500, 0.6));

  const engine = ctx.createOscillator();
  engine.type = 'sawtooth';
  engine.frequency.value = 40;
  const engineGain = layer(engine, filter('lowpass', 180));

  hum.start();
  rain.start();
  engine.start();
  ctx.resume?.();

  return {
    apply(plan) {
      const t = ctx.currentTime;
      humGain.gain.setTargetAtTime(plan.hum, t, 0.2);
      rainGain.gain.setTargetAtTime(plan.rain, t, 0.2);
      engineGain.gain.setTargetAtTime(plan.engine, t, 0.1);
      engine.frequency.setTargetAtTime(plan.engineHz || 40, t, 0.1);
    },
    close() {
      ctx.close();
    },
  };
}
