import { getDb } from "@/lib/db";
import { buildBrief } from "@/lib/voice/brief";
import { synthesize, VoiceUnavailableError } from "@/lib/voice/tts";

export const dynamic = "force-dynamic";

// Spoken output only: this route reads the brief and returns audio. It changes nothing.
export async function GET() {
  const text = buildBrief(getDb());
  try {
    const { audio, cached } = await synthesize(text);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Brief-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (error) {
    if (error instanceof VoiceUnavailableError) {
      return Response.json({ error: "voice_unavailable", message: error.message }, { status: 503 });
    }
    // Do not echo the error: it may carry request details.
    console.error("Brief audio failed:", error instanceof Error ? error.name : "unknown error");
    return Response.json(
      {
        error: "voice_failed",
        message: "Non sono riuscito a generare l'audio. Il brief resta in testo.",
      },
      { status: 502 },
    );
  }
}
