import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { env } from '@/lib/env';

export function getJobDir(videoId: string): string {
  return path.join(env.JOBS_OUTPUT_DIR, videoId);
}

export async function ensureJobDir(videoId: string): Promise<string> {
  const jobDir = getJobDir(videoId);
  await fs.mkdir(jobDir, { recursive: true });
  return jobDir;
}

export async function saveJson<T>(videoId: string, filename: string, data: T): Promise<string> {
  const jobDir = await ensureJobDir(videoId);
  const filePath = path.join(jobDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

export async function loadJson<T>(videoId: string, filename: string): Promise<T | null> {
  const filePath = path.join(getJobDir(videoId), filename);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function saveText(videoId: string, filename: string, content: string): Promise<string> {
  const jobDir = await ensureJobDir(videoId);
  const filePath = path.join(jobDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function loadText(videoId: string, filename: string): Promise<string | null> {
  const filePath = path.join(getJobDir(videoId), filename);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function saveBinary(videoId: string, filename: string, data: Buffer): Promise<string> {
  const jobDir = await ensureJobDir(videoId);
  const filePath = path.join(jobDir, filename);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function loadBinary(videoId: string, filename: string): Promise<Buffer | null> {
  const filePath = path.join(getJobDir(videoId), filename);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export function getFilePath(videoId: string, filename: string): string {
  return path.join(getJobDir(videoId), filename);
}

export async function fileExists(videoId: string, filename: string): Promise<boolean> {
  const filePath = getFilePath(videoId, filename);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(videoId: string, pattern?: string): Promise<string[]> {
  const jobDir = getJobDir(videoId);
  try {
    const files = await fs.readdir(jobDir);
    if (pattern) {
      const regex = new RegExp(pattern);
      return files.filter(f => regex.test(f));
    }
    return files;
  } catch {
    return [];
  }
}

export async function deleteFile(videoId: string, filename: string): Promise<void> {
  const filePath = getFilePath(videoId, filename);
  try {
    await fs.unlink(filePath);
  } catch {
    // File doesn't exist, ignore
  }
}

export async function copyFile(
  sourceVideoId: string,
  sourceFilename: string,
  destVideoId: string,
  destFilename: string
): Promise<string> {
  const sourcePath = getFilePath(sourceVideoId, sourceFilename);
  const destDir = await ensureJobDir(destVideoId);
  const destPath = path.join(destDir, destFilename);
  await fs.copyFile(sourcePath, destPath);
  return destPath;
}

export function getStyleReferenceBase64(): string {
  const stylePath = env.STYLE_REFERENCE_PATH;
  const buffer = fsSync.readFileSync(stylePath);
  return buffer.toString('base64');
}

export function getStyleReferencePath(): string {
  return env.STYLE_REFERENCE_PATH;
}

export function getStyleReferenceBase64ForChannel(styleReferencePath: string): string {
  const buffer = fsSync.readFileSync(styleReferencePath);
  return buffer.toString('base64');
}
