import path from "node:path";
import process from "node:process";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_PATH: z.string().default("./data/dmax.dev.sqlite"),
  TZ: z.string().default("Europe/Berlin"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  XAI_API_KEY: z.string().optional(),
  XAI_REALTIME_MODEL: z.string().default("grok-voice-think-fast-1.0"),
  DMAX_OPENCLAW_CONFIG_PATH: z.string().default("./openclaw/config.web.json"),
  DMAX_OPENCLAW_STATE_DIR: z.string().default("./data/openclaw-web-state"),
  DMAX_OPENCLAW_MODEL: z.string().default("openai-codex/gpt-5.5"),
  DMAX_OPENCLAW_SESSION_ID: z.string().default("dmax-web-app-chat"),
  DMAX_OPENCLAW_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(240),
  DMAX_OPENCLAW_PREWARM: z.string().default("0"),
  DMAX_OPENCLAW_PREWARM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  DMAX_OPENCLAW_PREWARM_WAIT_FOR_COMPLETION: z.string().default("0"),
  DMAX_API_PORT: z.coerce.number().int().positive().default(3088),
  DMAX_VOICE_ALLOWED_CALLERS: z.string().default(""),
  DMAX_VOICE_PUBLIC_BASE_URL: z.string().default(""),
  DMAX_VOICE_PORT: z.coerce.number().int().positive().default(3099),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VOICE_NUMBER: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional()
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  nodeEnv: parsedEnv.NODE_ENV,
  databasePath: path.resolve(parsedEnv.DATABASE_PATH),
  timezone: parsedEnv.TZ,
  openaiApiKey: parsedEnv.OPENAI_API_KEY,
  openaiTranscribeModel: parsedEnv.OPENAI_TRANSCRIBE_MODEL,
  xaiApiKey: parsedEnv.XAI_API_KEY,
  xaiRealtimeModel: parsedEnv.XAI_REALTIME_MODEL,
  dmaxOpenClawConfigPath: path.resolve(parsedEnv.DMAX_OPENCLAW_CONFIG_PATH),
  dmaxOpenClawStateDir: path.resolve(parsedEnv.DMAX_OPENCLAW_STATE_DIR),
  dmaxOpenClawModel: parsedEnv.DMAX_OPENCLAW_MODEL,
  dmaxOpenClawSessionId: parsedEnv.DMAX_OPENCLAW_SESSION_ID,
  dmaxOpenClawTimeoutSeconds: parsedEnv.DMAX_OPENCLAW_TIMEOUT_SECONDS,
  dmaxOpenClawPrewarm: parsedEnv.DMAX_OPENCLAW_PREWARM === "1",
  dmaxOpenClawPrewarmTimeoutMs: parsedEnv.DMAX_OPENCLAW_PREWARM_TIMEOUT_MS,
  dmaxOpenClawPrewarmWaitForCompletion: parsedEnv.DMAX_OPENCLAW_PREWARM_WAIT_FOR_COMPLETION === "1",
  dmaxApiPort: parsedEnv.DMAX_API_PORT,
  dmaxVoiceAllowedCallers: parsedEnv.DMAX_VOICE_ALLOWED_CALLERS,
  dmaxVoicePublicBaseUrl: parsedEnv.DMAX_VOICE_PUBLIC_BASE_URL,
  dmaxVoicePort: parsedEnv.DMAX_VOICE_PORT,
  twilioAccountSid: parsedEnv.TWILIO_ACCOUNT_SID,
  twilioAuthToken: parsedEnv.TWILIO_AUTH_TOKEN,
  twilioVoiceNumber: parsedEnv.TWILIO_VOICE_NUMBER,
  livekitUrl: parsedEnv.LIVEKIT_URL,
  livekitApiKey: parsedEnv.LIVEKIT_API_KEY,
  livekitApiSecret: parsedEnv.LIVEKIT_API_SECRET
};
