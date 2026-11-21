// Text to speech with ElevenLabs, with an on-disk cache so a repeated brief costs nothing.
//
// Model: eleven_flash_v2_5. Sources, checked 21 Nov 2026 through the ElevenLabs docs:
//  - elevenlabs.io/docs/overview/models: Flash v2.5, 32 languages (Italian included),
//    "50% lower price per character for API generations" than the other models;
//  - elevenlabs.io/docs/help-center/technical/what-models-do-you-offer-and-what-is-the-difference-between-them:
//    model_id = eleven_flash_v2_5; eleven_multilingual_v2 is the more expressive, dearer one.
// SDK call: client.textToSpeech.convert(voiceId, { text, modelId, outputFormat }) returns a
// ReadableStream of audio bytes (github.com/elevenlabs/elevenlabs-js). The default voice id is
// the one used in the SDK's own README example; override with ELEVENLABS_VOICE_ID and the
// model with ELEVENLABS_MODEL. The key is read from ELEVENLABS_API_KEY and never logged.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const DEFAULT_MODEL = "eleven_flash_v2_5";
export const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const OUTPUT_FORMAT = "mp3_44100_128";

export class VoiceUnavailableError extends Error {
  constructor() {
    super("Voce non disponibile: manca ELEVENLABS_API_KEY. Il brief resta in testo.");
    this.name = "VoiceUnavailableError";
  }
}

/** Minimal shape of what we use from the SDK, so tests can pass a fake. */
export interface TtsClient {
  textToSpeech: {
    convert(
      voiceId: string,
      request: { text: string; modelId: string; outputFormat: typeof OUTPUT_FORMAT },
    ): PromiseLike<ReadableStream<Uint8Array>>;
  };
}

export interface TtsOptions {
  cacheDir?: string;
  apiKey?: string | undefined;
  voiceId?: string;
  modelId?: string;
  client?: TtsClient;
}

export function cacheKey(text: string, modelId: string, voiceId: string): string {
  return crypto.createHash("sha256").update(`${modelId}\n${voiceId}\n${text}`).digest("hex");
}

export function defaultCacheDir(): string {
  return process.env.VOICE_CACHE_DIR ?? path.join(process.cwd(), "data", "voice");
}

export interface Speech {
  audio: Buffer;
  cached: boolean;
}

export async function synthesize(text: string, options: TtsOptions = {}): Promise<Speech> {
  const trimmed = text.trim();
  if (trimmed === "") throw new Error("Testo vuoto: niente da leggere.");
  const modelId = options.modelId ?? process.env.ELEVENLABS_MODEL ?? DEFAULT_MODEL;
  const voiceId = options.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const dir = options.cacheDir ?? defaultCacheDir();
  const file = path.join(dir, `${cacheKey(trimmed, modelId, voiceId)}.mp3`);

  // A cached brief is served even without a key: it costs nothing.
  if (fs.existsSync(file)) return { audio: fs.readFileSync(file), cached: true };

  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!options.client && !apiKey) throw new VoiceUnavailableError();
  const client: TtsClient = options.client ?? new ElevenLabsClient({ apiKey });
  const stream = await client.textToSpeech.convert(voiceId, {
    text: trimmed,
    modelId,
    outputFormat: OUTPUT_FORMAT,
  });
  const audio = Buffer.from(await new Response(stream).arrayBuffer());
  if (audio.length === 0) throw new Error("Audio vuoto dal servizio vocale.");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, audio);
  return { audio, cached: false };
}
