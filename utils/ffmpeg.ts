import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { AlignedScene } from '@/types';
import { getFilePath, ensureJobDir } from './fileStore';

export interface RenderOptions {
  videoId: string;
  scenes: AlignedScene[];
  audioPath: string;
  outputFilename?: string;
  fps?: number;
  zoomAmount?: number;
}

/**
 * Run an FFmpeg command and return a promise.
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Running FFmpeg:', 'ffmpeg', args.join(' '));

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });
  });
}

/**
 * Render a single scene with zoom effect.
 */
async function renderScene(
  imagePath: string,
  duration: number,
  outputPath: string,
  fps: number,
  _zoomAmount: number
): Promise<void> {
  // Static image - no zoom effect, just scale to 1920x1080
  const args = [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', duration.toString(),
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-r', fps.toString(),
    outputPath,
  ];

  await runFFmpeg(args);
}

/**
 * Concatenate multiple video segments.
 */
async function concatenateVideos(
  inputPaths: string[],
  outputPath: string,
  listFilePath: string
): Promise<void> {
  // Create concat file with paths relative to the list file's directory
  const listDir = path.dirname(listFilePath);
  const concatContent = inputPaths.map(p => {
    // Convert to relative path from the list file's directory
    const relativePath = path.relative(listDir, p);
    // Use forward slashes for FFmpeg compatibility on all platforms
    const ffmpegPath = relativePath.replace(/\\/g, '/');
    return `file '${ffmpegPath.replace(/'/g, "'\\''")}'`;
  }).join('\n');

  console.log('[DEBUG ffmpeg] Concat file content:', concatContent);
  await fs.writeFile(listFilePath, concatContent);

  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFilePath,
    '-c', 'copy',
    outputPath,
  ];

  await runFFmpeg(args);
}

/**
 * Add audio and captions to video.
 */
async function addAudioAndCaptions(
  videoPath: string,
  audioPath: string,
  captionsPath: string | null,
  outputPath: string
): Promise<void> {
  const args = [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
  ];

  if (captionsPath) {
    // Use ASS subtitles filter
    args.push('-vf', `ass='${captionsPath.replace(/'/g, "'\\''").replace(/\\/g, '\\\\').replace(/:/g, '\\:')}'`);
    args.push('-c:v', 'libx264');
    args.push('-preset', 'fast');
  } else {
    args.push('-c:v', 'copy');
  }

  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    outputPath
  );

  await runFFmpeg(args);
}

/**
 * Render the final video from aligned scenes.
 */
export async function renderVideo(options: RenderOptions): Promise<string> {
  const {
    videoId,
    scenes,
    audioPath,
    outputFilename = 'final.mp4',
    fps = 25,
    zoomAmount = 0.05,
  } = options;

  const jobDir = await ensureJobDir(videoId);
  const tempDir = path.join(jobDir, 'temp');
  await fs.mkdir(tempDir, { recursive: true });

  console.log(`Rendering ${scenes.length} scenes...`);

  // Step 1: Render each scene with zoom effect
  const sceneVideos: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneVideoPath = path.join(tempDir, `scene_${i.toString().padStart(3, '0')}.mp4`);

    // Derive clip duration from timeline position, not stored duration field.
    // This accounts for any gaps or adjustments in the aligned scene timeline.
    const clipDuration = i < scenes.length - 1
      ? scenes[i + 1].startTime - scene.startTime
      : scene.duration;

    console.log(`Rendering scene ${i + 1}/${scenes.length} (${clipDuration.toFixed(2)}s)`);

    await renderScene(
      scene.imagePath,
      clipDuration,
      sceneVideoPath,
      fps,
      zoomAmount
    );

    sceneVideos.push(sceneVideoPath);
  }

  // Step 2: Concatenate all scene videos
  const concatPath = path.join(tempDir, 'concat.mp4');
  const listFilePath = path.join(tempDir, 'scenes.txt');

  console.log('Concatenating scenes...');
  await concatenateVideos(sceneVideos, concatPath, listFilePath);

  // Step 3: Add audio (no captions - cleaner video output)
  const finalPath = getFilePath(videoId, outputFilename);
  console.log('Adding audio...');
  await addAudioAndCaptions(concatPath, audioPath, null, finalPath);

  // Step 5: Cleanup temp files
  console.log('Cleaning up temp files...');
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    console.warn('Failed to cleanup temp directory');
  }

  console.log(`Video rendered: ${finalPath}`);
  return finalPath;
}

/**
 * Concatenate multiple audio files into a single output using ffmpeg aconcat filter.
 * All inputs must be the same format (24kHz mono 16-bit WAV).
 */
export async function concatenateAudioFiles(inputPaths: string[], outputPath: string): Promise<void> {
  if (inputPaths.length === 0) {
    throw new Error('No input audio files provided');
  }
  if (inputPaths.length === 1) {
    // Single file — just copy it
    await fs.copyFile(inputPaths[0], outputPath);
    return;
  }

  const args: string[] = ['-y'];
  for (const p of inputPaths) {
    args.push('-i', p);
  }

  // Build aconcat filter: [0:a][1:a]...[N:a]aconcat=n=N[out]
  const filterInputs = inputPaths.map((_, i) => `[${i}:a]`).join('');
  args.push(
    '-filter_complex', `${filterInputs}aconcat=n=${inputPaths.length}[out]`,
    '-map', '[out]',
    outputPath
  );

  await runFFmpeg(args);
}

/**
 * Get video duration using ffprobe.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);

    let stdout = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Check if FFmpeg is available.
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}
