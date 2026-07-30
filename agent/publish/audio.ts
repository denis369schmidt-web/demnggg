/**
 * Beat-Audio-Renderer.
 *
 * Synthetisiert aus dem Beat-Preset der Edition einen Übungs-Beat als
 * WAV-Datei (mono, 44,1 kHz, 16 Bit) – dieselbe Drum-Logik wie die
 * WebAudio-Engine der App (Kick: Sinus-Sweep, Snare: Bandpass-Noise,
 * Hi-Hat: Highpass-Noise auf jedem Achtel). Deterministisch geseedet,
 * damit jede Edition immer denselben Beat bekommt.
 */

import { Rng } from "../lib/rng.ts";

const SAMPLE_RATE = 44100;
const PULSES_PER_BAR = 8;
const MASTER_GAIN = 0.85;

/** RBJ-Biquad-Filter (Audio EQ Cookbook) für Snare/Hi-Hat-Färbung. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  static bandpass(frequency: number, q: number): Biquad {
    const filter = new Biquad();
    const w0 = (2 * Math.PI * frequency) / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    filter.b0 = alpha / a0;
    filter.b1 = 0;
    filter.b2 = -alpha / a0;
    filter.a1 = (-2 * Math.cos(w0)) / a0;
    filter.a2 = (1 - alpha) / a0;
    return filter;
  }

  static highpass(frequency: number, q: number): Biquad {
    const filter = new Biquad();
    const w0 = (2 * Math.PI * frequency) / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * q);
    const cosW0 = Math.cos(w0);
    const a0 = 1 + alpha;
    filter.b0 = (1 + cosW0) / 2 / a0;
    filter.b1 = -(1 + cosW0) / a0;
    filter.b2 = (1 + cosW0) / 2 / a0;
    filter.a1 = (-2 * cosW0) / a0;
    filter.a2 = (1 - alpha) / a0;
    return filter;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 -
      this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function expEnvelope(t: number, from: number, to: number, duration: number) {
  if (t < 0 || t > duration) return 0;
  return from * Math.pow(to / from, t / duration);
}

function addKick(buffer: Float32Array, startSample: number) {
  const duration = 0.13;
  const samples = Math.floor(duration * SAMPLE_RATE);
  let phase = 0;

  for (let i = 0; i < samples && startSample + i < buffer.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = t < 0.1 ? 150 * Math.pow(48 / 150, t / 0.1) : 48;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    buffer[startSample + i] += Math.sin(phase) *
      expEnvelope(t, 1, 0.001, 0.12);
  }
}

function addSnare(buffer: Float32Array, startSample: number, rng: Rng) {
  const duration = 0.18;
  const samples = Math.floor(duration * SAMPLE_RATE);
  const filter = Biquad.bandpass(1700, 1.2);

  for (let i = 0; i < samples && startSample + i < buffer.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const noise = rng.next() * 2 - 1;
    buffer[startSample + i] += filter.process(noise) *
      expEnvelope(t, 0.9, 0.01, 0.16);
  }
}

function addHat(buffer: Float32Array, startSample: number, rng: Rng) {
  const duration = 0.05;
  const samples = Math.floor(duration * SAMPLE_RATE);
  const filter = Biquad.highpass(5500, 0.9);

  for (let i = 0; i < samples && startSample + i < buffer.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const noise = rng.next() * 2 - 1;
    buffer[startSample + i] += filter.process(noise) *
      expEnvelope(t, 0.3, 0.01, 0.03);
  }
}

export interface RenderedBeat {
  wav: Uint8Array;
  seconds: number;
  bars: number;
}

export function renderBeatWav(
  bpm: number,
  seed: string,
  targetSeconds = 64,
): RenderedBeat {
  const rng = new Rng(`beat-${seed}`);
  const pulseInterval = 60 / bpm / 2;
  const barSeconds = pulseInterval * PULSES_PER_BAR;
  const bars = Math.max(8, Math.round(targetSeconds / barSeconds));
  const seconds = bars * barSeconds + 0.5;

  const buffer = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
  const totalPulses = bars * PULSES_PER_BAR;

  for (let pulse = 0; pulse < totalPulses; pulse += 1) {
    const startSample = Math.floor(pulse * pulseInterval * SAMPLE_RATE);
    if (pulse % 4 === 0) addKick(buffer, startSample);
    if (pulse % 4 === 2) addSnare(buffer, startSample, rng);
    addHat(buffer, startSample, rng);
  }

  return { wav: encodeWav(buffer), seconds, bars };
}

function encodeWav(samples: Float32Array): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      bytes[offset + i] = text.charCodeAt(i);
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * MASTER_GAIN));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return bytes;
}
