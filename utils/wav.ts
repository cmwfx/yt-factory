/**
 * Creates a WAV file buffer from raw PCM audio data.
 * Designed for Gemini TTS output: 24kHz, mono, 16-bit.
 */
export function createWavBuffer(pcmData: Buffer): Buffer {
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(48000, 28); // byte rate (24000 * 1 * 2)
  header.writeUInt16LE(2, 32); // block align (1 * 2)
  header.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Calculate audio duration from WAV buffer (or just PCM data).
 * @param data - WAV buffer (with header) or raw PCM buffer
 * @param sampleRate - Sample rate (default 24000 for Gemini TTS)
 * @param bitsPerSample - Bits per sample (default 16)
 * @param channels - Number of channels (default 1 for mono)
 */
export function calculateAudioDuration(
  data: Buffer,
  sampleRate = 24000,
  bitsPerSample = 16,
  channels = 1
): number {
  // If it's a WAV file, skip the header (44 bytes)
  const isWav = data.slice(0, 4).toString() === 'RIFF';
  const pcmLength = isWav ? data.length - 44 : data.length;

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = pcmLength / (bytesPerSample * channels);
  return totalSamples / sampleRate;
}

/**
 * Get audio metadata from a WAV buffer.
 */
export function getWavMetadata(wavBuffer: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  duration: number;
} | null {
  if (wavBuffer.slice(0, 4).toString() !== 'RIFF') {
    return null;
  }

  const channels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const dataSize = wavBuffer.readUInt32LE(40);

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = dataSize / (bytesPerSample * channels);
  const duration = totalSamples / sampleRate;

  return {
    sampleRate,
    channels,
    bitsPerSample,
    duration,
  };
}
