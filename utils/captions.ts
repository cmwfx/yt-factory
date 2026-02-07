import type { AlignedScene, WordTimestamp } from '@/types';

export interface Caption {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Generate captions from aligned scenes.
 * Each scene becomes a caption block.
 */
export function generateCaptionsFromScenes(scenes: AlignedScene[]): Caption[] {
  return scenes.map(scene => ({
    text: scene.overlayText || truncateText(scene.text, 100),
    startTime: scene.startTime,
    endTime: scene.endTime,
  }));
}

/**
 * Generate word-by-word captions from transcription.
 * Groups words into readable chunks.
 */
export function generateCaptionsFromTranscription(
  words: WordTimestamp[],
  maxWordsPerCaption = 8,
  maxCharsPerCaption = 60
): Caption[] {
  const captions: Caption[] = [];
  let currentCaption: WordTimestamp[] = [];

  for (const word of words) {
    currentCaption.push(word);

    const text = currentCaption.map(w => w.word).join(' ');
    const shouldBreak =
      currentCaption.length >= maxWordsPerCaption ||
      text.length >= maxCharsPerCaption ||
      word.word.endsWith('.') ||
      word.word.endsWith('?') ||
      word.word.endsWith('!');

    if (shouldBreak && currentCaption.length > 0) {
      captions.push({
        text: currentCaption.map(w => w.word).join(' '),
        startTime: currentCaption[0].start / 1000,
        endTime: currentCaption[currentCaption.length - 1].end / 1000,
      });
      currentCaption = [];
    }
  }

  // Handle remaining words
  if (currentCaption.length > 0) {
    captions.push({
      text: currentCaption.map(w => w.word).join(' '),
      startTime: currentCaption[0].start / 1000,
      endTime: currentCaption[currentCaption.length - 1].end / 1000,
    });
  }

  return captions;
}

/**
 * Convert captions to SRT format.
 */
export function captionsToSrt(captions: Caption[]): string {
  return captions
    .map((caption, index) => {
      const start = formatSrtTime(caption.startTime);
      const end = formatSrtTime(caption.endTime);
      return `${index + 1}\n${start} --> ${end}\n${caption.text}\n`;
    })
    .join('\n');
}

/**
 * Convert captions to ASS (Advanced SubStation Alpha) format.
 * Better styling support for FFmpeg.
 */
export function captionsToAss(
  captions: Caption[],
  options: {
    fontName?: string;
    fontSize?: number;
    primaryColor?: string;
    outlineColor?: string;
    backColor?: string;
    bold?: boolean;
    alignment?: number;
    marginV?: number;
  } = {}
): string {
  const {
    fontName = 'Arial',
    fontSize = 48,
    primaryColor = '&H00FFFFFF', // White
    outlineColor = '&H00000000', // Black
    backColor = '&H80000000', // Semi-transparent black
    bold = true,
    alignment = 2, // Bottom center
    marginV = 50,
  } = options;

  const header = `[Script Info]
Title: Video Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold ? -1 : 0},0,0,0,100,100,0,0,1,2,1,${alignment},10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = captions
    .map(caption => {
      const start = formatAssTime(caption.startTime);
      const end = formatAssTime(caption.endTime);
      const text = escapeAssText(caption.text);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return header + events;
}

/**
 * Format time for SRT: HH:MM:SS,mmm
 */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/**
 * Format time for ASS: H:MM:SS.cc
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

/**
 * Pad a number with leading zeros.
 */
function pad(num: number, length: number): string {
  return num.toString().padStart(length, '0');
}

/**
 * Escape special characters for ASS format.
 */
function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

/**
 * Truncate text to a maximum length.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
