import { randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import { twilioMulaw8kAudioContract } from "../src/voice/audio-contracts.js";
import { XaiRealtimeProvider } from "../src/voice/xai-realtime-provider.js";

const provider = new XaiRealtimeProvider({
  apiKey: env.xaiApiKey,
  model: env.xaiRealtimeModel
});

console.log(JSON.stringify({ type: "expected_capabilities", data: provider.describeCapabilities() }, null, 2));

if (!env.xaiApiKey) {
  console.log(JSON.stringify({ type: "skipped_live_check", reason: "XAI_API_KEY is not set" }, null, 2));
  process.exit(0);
}

const session = await provider.startSession({
  id: randomUUID(),
  mode: "drive",
  transport: "twilio_media_stream",
  startedAt: new Date().toISOString(),
  audio: twilioMulaw8kAudioContract
});

await session.close();

console.log(
  JSON.stringify(
    {
      type: "live_check_ok",
      model: env.xaiRealtimeModel,
      databasePath: env.databasePath
    },
    null,
    2
  )
);
