import test from 'node:test';
import assert from 'node:assert/strict';

test('focus sound resumes audio and starts an audible oscillator once', async () => {
  const starts = [];
  const stops = [];
  const ramps = [];
  let resumeCalls = 0;
  let suspendCalls = 0;

  class MockAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 10;
      this.destination = {};
    }

    async resume() {
      resumeCalls += 1;
      this.state = 'running';
    }

    async suspend() {
      suspendCalls += 1;
      this.state = 'suspended';
    }

    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        connect() {},
        start: (at) => starts.push(at),
        stop: (at) => stops.push(at),
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime: (value) => ramps.push(value),
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }

  globalThis.window = { AudioContext: MockAudioContext };
  const { startFocusSound, stopFocusSound } = await import('../src/audio.js');

  assert.equal(await startFocusSound(), true);
  assert.equal(await startFocusSound(), true);
  assert.equal(resumeCalls, 1);
  assert.equal(starts.length, 1);
  assert.ok(ramps.includes(0.06));

  stopFocusSound();
  assert.equal(stops.length, 2);
  assert.equal(suspendCalls, 1);
  delete globalThis.window;
});
