import { z } from 'zod';

const booleanString = z.string().optional().transform(v => v === '1' || v === 'true');

const envSchema = z.object({
  DATABASE_URL: z.string(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().optional().default('us-central1'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_GENAI_API_KEY: z.string().optional(),
  ASSEMBLYAI_API_KEY: z.string(),
  STYLE_REFERENCE_PATH: z.string(),
  GENERATE_IDEAS: booleanString.default(false),
  TEST_MODE: booleanString.default(false),
  JOBS_OUTPUT_DIR: z.string().optional().default('./public/jobs'),
  JWT_SECRET: z.string(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function getEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment variable validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment variables');
  }

  return result.data;
}

export const env = getEnv();
