let ctx: AudioContext | null = null;
let nodes: AudioNode[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function makeNoiseBuffer(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // brown-ish noise — terdengar seperti angin jauh
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

function bell(c: AudioContext, freq: number, gainPeak: number, dur = 9): AudioNode[] {
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gainPeak, c.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  const partials = [1, 2.76, 5.4, 8.93];
  const oscs = partials.map((p, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * p * (1 + (Math.random() - 0.5) * 0.004);
    const og = c.createGain();
    og.gain.value = gainPeak > 0.1 ? [0.5, 0.32, 0.12, 0.06][i] : [0.6, 0.22, 0.08, 0.03][i];
    o.connect(og).connect(g);
    o.start();
    o.stop(c.currentTime + dur + 0.1);
    return o;
  });
  return [g, ...oscs];
}

export async function startSoundscape(): Promise<void> {
  if (ctx) return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  ctx = new AC();
  await ctx.resume();

  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
  master.connect(ctx.destination);
  nodes.push(master);

  // lapisan angin (filtered brown noise, LFO lambat)
  const wind = ctx.createBufferSource();
  wind.buffer = makeNoiseBuffer(ctx);
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 320;
  windFilter.Q.value = 0.4;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.16;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(windFilter.frequency);
  wind.connect(windFilter).connect(windGain).connect(master);
  wind.start();
  lfo.start();
  nodes.push(wind, lfo);

  // drone rendah — gunung itu sendiri
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 48;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  drone.connect(droneGain).connect(master);
  drone.start();
  nodes.push(drone);

  // kail kuningan acak + sesekali gong kembar
  const chime = () => {
    if (!ctx) return;
    const [g] = bell(ctx, 620 + Math.random() * 900, 0.045, 6);
    g.connect(master);
    if (Math.random() < 0.14) {
      // gong: dentuman tunggal — ia sedang berpindah
      setTimeout(() => {
        if (!ctx) return;
        const [gg] = bell(ctx, 92 + Math.random() * 24, 0.22, 14);
        gg.connect(master);
      }, 900 + Math.random() * 2400);
    }
  };
  timer = setInterval(chime, 1700);
  chime();
}

export function stopSoundscape(): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (!ctx) return;
  const c = ctx;
  const master = nodes[0] as GainNode | undefined;
  if (master && master.gain) {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(master.gain.value, c.currentTime);
    master.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
  }
  setTimeout(() => {
    nodes.forEach(n => { try { (n as OscillatorNode).stop?.(); } catch {} });
    nodes = [];
    c.close();
    if (ctx === c) ctx = null;
  }, 1400);
}
