import cron from 'node-cron';
import { getDueSchedules, updateScheduleRun } from '@/lib/db';
import { startPipeline } from '@/workers/pipeline';
import { sendTelegramMessage } from '@/lib/telegram';

let schedulerTask: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler() {
  if (schedulerTask) return;
  console.log('[scheduler] Starting scheduler (checks every minute)');

  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      const dueSchedules = await getDueSchedules();
      if (dueSchedules.length === 0) return;

      console.log(`[scheduler] ${dueSchedules.length} schedule(s) due`);

      for (const schedule of dueSchedules) {
        try {
          console.log(`[scheduler] Running schedule ${schedule.id} (every ${schedule.intervalHours}h)`);

          // Start pipeline in background (pass channelId if schedule has one)
          startPipeline({
            generateIdeas: schedule.generateIdeas,
            testMode: false,
            enableManualReview: schedule.enableReview,
            channelId: (schedule as any).channelId || undefined,
          }).catch(err => {
            console.error(`[scheduler] Pipeline failed for schedule ${schedule.id}:`, err);
            sendTelegramMessage(`Scheduled pipeline failed: ${err.message}`);
          });

          // Update schedule timestamps
          await updateScheduleRun(schedule.id, schedule.intervalHours);
        } catch (error) {
          console.error(`[scheduler] Error running schedule ${schedule.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[scheduler] Error checking schedules:', error);
    }
  });
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}
