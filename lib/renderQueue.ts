import { acquireRenderLockDb, releaseRenderLockDb, updateVideoStatus } from '@/lib/db';

const POLL_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Acquire the render lock. Blocks until the lock is available.
 * Sets video status to 'render_queued' while waiting.
 */
export async function acquireRenderLock(videoId: string): Promise<void> {
  // Try to acquire immediately
  const acquired = await acquireRenderLockDb(videoId);
  if (acquired) {
    console.log(`[renderQueue] Lock acquired for video ${videoId}`);
    return;
  }

  // Lock is held by another video — wait
  console.log(`[renderQueue] Lock busy, queuing video ${videoId}`);
  await updateVideoStatus(videoId, 'render_queued');

  // Poll until lock is available
  return new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      try {
        const got = await acquireRenderLockDb(videoId);
        if (got) {
          clearInterval(interval);
          console.log(`[renderQueue] Lock acquired for video ${videoId}`);
          resolve();
        }
      } catch (error) {
        console.error(`[renderQueue] Error polling for lock:`, error);
      }
    }, POLL_INTERVAL_MS);
  });
}

/**
 * Release the render lock.
 */
export async function releaseRenderLock(videoId: string): Promise<void> {
  await releaseRenderLockDb(videoId);
  console.log(`[renderQueue] Lock released for video ${videoId}`);
}
