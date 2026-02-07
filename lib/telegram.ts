import { env } from '@/lib/env';

export async function sendTelegramMessage(message: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`[telegram] No token/chat ID configured, skipping: ${message}`);
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram] Failed to send message: ${res.status} ${body}`);
    }
  } catch (error) {
    console.error('[telegram] Error sending message:', error);
  }
}
