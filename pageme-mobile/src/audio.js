// audio.js — WebAudio beep + vibration triggers

let __audioCtx = null;
function getCtx() {
  if (!__audioCtx) {
    try { __audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (__audioCtx.state === "suspended") __audioCtx.resume();
  return __audioCtx;
}

export function blip({ freq = 2400, dur = 0.09, type = "square", vol = 0.18, enabled = true } = {}) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  gain.gain.linearRampToValueAtTime(vol, t0 + dur - 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Two-tone urgent beep, classic pager
export function pageAlert({ enabled = true } = {}) {
  if (!enabled) return;
  blip({ freq: 2400, dur: 0.11, enabled: true });
  setTimeout(() => blip({ freq: 2800, dur: 0.11, enabled: true }), 130);
  setTimeout(() => blip({ freq: 2400, dur: 0.11, enabled: true }), 280);
  setTimeout(() => blip({ freq: 2800, dur: 0.11, enabled: true }), 410);
}

export function buttonClick({ enabled = true } = {}) {
  if (!enabled) return;
  blip({ freq: 1600, dur: 0.025, vol: 0.07, enabled: true });
}

export function bootChime({ enabled = true } = {}) {
  if (!enabled) return;
  blip({ freq: 1200, dur: 0.06, vol: 0.12, enabled: true });
  setTimeout(() => blip({ freq: 1800, dur: 0.06, vol: 0.12, enabled: true }), 80);
  setTimeout(() => blip({ freq: 2400, dur: 0.10, vol: 0.12, enabled: true }), 160);
}

let __focusSoundInterval = null;
let __focusSoundStartPromise = null;
let __focusSoundShouldPlay = false;
const __focusOscillators = new Set();

export function startFocusSound() {
  __focusSoundShouldPlay = true;
  if (__focusSoundInterval) return Promise.resolve(true);
  if (__focusSoundStartPromise) return __focusSoundStartPromise;

  __focusSoundStartPromise = (async () => {
    const ctx = getCtx();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (e) { return false; }
    }
    if (ctx.state !== "running" || !__focusSoundShouldPlay) {
      if (!__focusSoundShouldPlay && ctx.state === "running" && typeof ctx.suspend === "function") {
        ctx.suspend().catch(() => {});
      }
      return false;
    }

    const freqs = [261.63, 329.63, 392.00, 440.00, 523.25, 587.33];

    const playNextNote = () => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      const freq = freqs[Math.floor(Math.random() * freqs.length)];
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.06, t0 + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      __focusOscillators.add(osc);
      osc.onended = () => __focusOscillators.delete(osc);
      osc.start(t0);
      osc.stop(t0 + 3.0);
    };

    playNextNote();
    __focusSoundInterval = setInterval(playNextNote, 2400);
    return true;
  })().finally(() => {
    __focusSoundStartPromise = null;
  });

  return __focusSoundStartPromise;
}

export function stopFocusSound() {
  __focusSoundShouldPlay = false;
  if (__focusSoundInterval) {
    clearInterval(__focusSoundInterval);
    __focusSoundInterval = null;
  }
  __focusOscillators.forEach((osc) => {
    try { osc.stop(); } catch (e) {}
  });
  __focusOscillators.clear();
  if (__audioCtx && __audioCtx.state === "running" && typeof __audioCtx.suspend === "function") {
    __audioCtx.suspend().catch(() => {});
  }
}
