import { getDb } from "@/lib/db";
import { daysToDeadline, today } from "@/components/format";
import { getLatestRun } from "@/lib/queries";
import { buildActionBrief, buildBrief } from "@/lib/voice/brief";
import { synthesize, VoiceUnavailableError } from "@/lib/voice/tts";

export const dynamic = "force-dynamic";

// Spoken output only: this route reads the brief and returns audio. It changes nothing.
export async function GET(request: Request) {
  // ?detail=1 reads the full per-invoice text.
  const detail = new URL(request.url).searchParams.get("detail") === "1";
  const db = getDb();
  const run = getLatestRun(db);
  // Default: what to do next, most urgent first. It does not repeat the dashboard counts.
  const text = detail
    ? buildBrief(db)
    : buildActionBrief(db, run ? daysToDeadline(run.month, today().date) : null);
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
