import { ensureRenderLock } from '@/lib/db';
import { startBatchPoller } from '@/lib/batchPoller';
import { startScheduler } from '@/lib/scheduler';

let bootstrapped = false;

export async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  console.log('[bootstrap] Initializing server...');

  try {
    // 1. Ensure RenderLock singleton exists
    await ensureRenderLock();
    console.log('[bootstrap] RenderLock singleton ensured');

    // 2. Start batch poller
    startBatchPoller();
    console.log('[bootstrap] Batch poller started');

    // 3. Start scheduler
    startScheduler();
    console.log('[bootstrap] Scheduler started');

    console.log('[bootstrap] Server initialization complete');
  } catch (error) {
    console.error('[bootstrap] Initialization failed:', error);
  }
}
