import fs from 'fs';
import path from 'path';

// Generate valid, high-quality PCM WAV audio files for instant testing
function createWavHeader(dataLength, sampleRate = 44100, numChannels = 2, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0); // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  buffer.write('WAVE', 8); // Format
  buffer.write('fmt ', 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  buffer.write('data', 36); // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return buffer;
}

export function ensurePresetTracks(uploadDir) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const sampleRate = 44100;
  const durationSec = 30; // 30 seconds of high-energy looping audio
  const totalSamples = sampleRate * durationSec;
  const numChannels = 2;
  const dataSize = totalSamples * numChannels * 2;

  const tracks = [
    {
      id: 'track-preset-1',
      filename: 'neon_synth_anthem.wav',
      title: 'Neon Cyber Anthem',
      artist: 'BeatSync Studio (Electronic)',
      duration: durationSec,
      generator: (t) => {
        // Electronic synth arp with pulsating bassline
        const beat = Math.floor(t * 2.2); // ~132 BPM
        const freq = [220, 261.63, 329.63, 392, 440, 523.25, 659.25, 523.25][beat % 8];
        const bass = [110, 110, 130.81, 146.83][Math.floor(beat / 4) % 4];
        const kick = (t * 2.2) % 1 < 0.15 ? Math.sin(2 * Math.PI * 65 * (1 - ((t * 2.2) % 1))) : 0;
        const synth = Math.sin(2 * Math.PI * freq * t) * 0.4 + 
                      Math.sin(2 * Math.PI * (freq * 1.01) * t) * 0.2;
        const bassSynth = Math.sin(2 * Math.PI * bass * t) * 0.35;
        return (synth + bassSynth + kick * 0.5) * 0.6;
      }
    },
    {
      id: 'track-preset-2',
      filename: 'midnight_bass_drop.wav',
      title: 'Midnight Bass Drop',
      artist: 'SonicSync Club (EDM)',
      duration: durationSec,
      generator: (t) => {
        // 128 BPM Club 4-on-the-floor
        const beat = t * 2.133;
        const kickEnv = Math.max(0, 1 - (beat % 1) * 3);
        const kick = Math.sin(2 * Math.PI * (50 + 80 * kickEnv) * t) * kickEnv;
        const hihat = (beat % 0.5 > 0.25) ? (Math.random() - 0.5) * 0.25 * Math.max(0, 1 - ((beat % 0.5) - 0.25) * 8) : 0;
        const leadFreq = (Math.floor(beat) % 4 === 3) ? 440 : 330;
        const lead = Math.sin(2 * Math.PI * leadFreq * t) * 0.3;
        return (kick * 0.6 + hihat + lead * 0.35) * 0.7;
      }
    },
    {
      id: 'track-preset-3',
      filename: 'chill_drift_lofi.wav',
      title: 'Sunset Drift Lo-Fi',
      artist: 'Aura Chill (Lo-Fi)',
      duration: durationSec,
      generator: (t) => {
        // Lo-Fi mellow chords ~85 BPM
        const beat = t * 1.416;
        const chord = [261.63, 329.63, 392, 493.88];
        let mel = 0;
        chord.forEach((f, idx) => {
          mel += Math.sin(2 * Math.PI * f * t) * (0.15 / (idx + 1));
        });
        const snare = (Math.floor(beat) % 2 === 1 && (beat % 1) < 0.2) ? (Math.random() - 0.5) * 0.3 : 0;
        return (mel * 0.6 + snare) * 0.6;
      }
    }
  ];

  const generatedTrackList = [];

  for (const tr of tracks) {
    const filePath = path.join(uploadDir, tr.filename);
    if (!fs.existsSync(filePath)) {
      const pcmData = Buffer.alloc(dataSize);
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const sampleVal = Math.max(-1, Math.min(1, tr.generator(t)));
        const int16Val = Math.floor(sampleVal * 32767);
        // Write Stereo (Left and Right)
        const offset = i * 4;
        pcmData.writeInt16LE(int16Val, offset);
        pcmData.writeInt16LE(int16Val, offset + 2);
      }
      const header = createWavHeader(dataSize, sampleRate, numChannels, 16);
      fs.writeFileSync(filePath, Buffer.concat([header, pcmData]));
      console.log(`🎵 [AudioEngine] Generated preset track: ${tr.filename} (${durationSec}s)`);
    }

    generatedTrackList.push({
      id: tr.id,
      title: tr.title,
      artist: tr.artist,
      duration: tr.duration,
      url: `/api/audio/${tr.filename}`,
      filename: tr.filename,
      isPreset: true
    });
  }

  return generatedTrackList;
}
