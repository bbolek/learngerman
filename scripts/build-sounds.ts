/**
 * Synthesize the app's short reward/feedback cues as tiny mono WAV files.
 * No audio deps — plain 16-bit PCM written by hand. Deterministic: the same
 * script always produces byte-identical files (they are committed).
 *
 *   npm run build:sounds   →  assets/sounds/*.wav
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SAMPLE_RATE = 22050;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

interface Note {
  freq: number;
  /** Seconds from the start of the clip. */
  at: number;
  dur: number;
  amp: number;
}

/** Soft synth voice: sine + quiet octave harmonic, fast attack, exp decay. */
function render(notes: Note[], totalSec: number): Float64Array {
  const buf = new Float64Array(Math.ceil(totalSec * SAMPLE_RATE));
  for (const { freq, at, dur, amp } of notes) {
    const start = Math.floor(at * SAMPLE_RATE);
    const len = Math.floor(dur * SAMPLE_RATE);
    const attack = Math.floor(0.006 * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < buf.length; i++) {
      const t = i / SAMPLE_RATE;
      const env = (i < attack ? i / attack : 1) * Math.exp(-4.5 * (i / len));
      const s =
        Math.sin(2 * Math.PI * freq * t) * 0.85 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
      buf[start + i] += s * env * amp;
    }
  }
  return buf;
}

function writeWav(name: string, samples: Float64Array): void {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const norm = peak > 0 ? 0.82 / peak : 1;
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    pcm.writeInt16LE(Math.round(samples[i] * norm * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(OUT_DIR, name), Buffer.concat([header, pcm]));
  console.log(`  ${name} — ${((44 + pcm.length) / 1024).toFixed(1)} kB`);
}

// Note frequencies (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880.0;
const C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, C7 = 2093.0;

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Building sounds →', OUT_DIR);

// Quick, friendly "richtig" blip: two rising notes.
writeWav(
  'correct.wav',
  render(
    [
      { freq: A5, at: 0, dur: 0.09, amp: 0.7 },
      { freq: D6, at: 0.06, dur: 0.14, amp: 0.8 },
    ],
    0.24
  )
);

// Muted low "falsch" knock: short descending minor second.
writeWav(
  'wrong.wav',
  render(
    [
      { freq: 233.08, at: 0, dur: 0.12, amp: 0.8 },
      { freq: 207.65, at: 0.09, dur: 0.16, amp: 0.7 },
    ],
    0.3
  )
);

// Level-up: rising C-major arpeggio with a held top note.
writeWav(
  'levelup.wav',
  render(
    [
      { freq: C5, at: 0.0, dur: 0.16, amp: 0.55 },
      { freq: E5, at: 0.09, dur: 0.16, amp: 0.6 },
      { freq: G5, at: 0.18, dur: 0.16, amp: 0.65 },
      { freq: C6, at: 0.27, dur: 0.4, amp: 0.8 },
      { freq: E6, at: 0.27, dur: 0.4, amp: 0.3 },
    ],
    0.75
  )
);

// Fanfare for records, badges & streak milestones: two chords up.
writeWav(
  'fanfare.wav',
  render(
    [
      { freq: G5, at: 0.0, dur: 0.14, amp: 0.5 },
      { freq: C6, at: 0.0, dur: 0.14, amp: 0.5 },
      { freq: G5, at: 0.16, dur: 0.12, amp: 0.45 },
      { freq: C6, at: 0.16, dur: 0.12, amp: 0.45 },
      { freq: C6, at: 0.3, dur: 0.5, amp: 0.6 },
      { freq: E6, at: 0.3, dur: 0.5, amp: 0.55 },
      { freq: G6, at: 0.3, dur: 0.5, amp: 0.5 },
    ],
    0.9
  )
);

// Quest complete: bright little sparkle.
writeWav(
  'quest.wav',
  render(
    [
      { freq: G6, at: 0, dur: 0.1, amp: 0.6 },
      { freq: C7, at: 0.07, dur: 0.2, amp: 0.7 },
    ],
    0.32
  )
);

console.log('Done.');
