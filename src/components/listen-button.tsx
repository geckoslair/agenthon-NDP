"use client";
// Plays the spoken brief. Output only: nothing here approves or sends.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ListenButton({ detail = false }: { detail?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function listen() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setError(null);
    setState("loading");
    try {
      const res = await fetch(detail ? "/api/brief/audio?detail=1" : "/api/brief/audio");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Audio non disponibile. Il brief resta in testo.");
      }
      const url = URL.createObjectURL(await res.blob());
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => setState("idle");
      await el.play();
      setState("playing");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Audio non disponibile.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" onClick={listen} disabled={state === "loading"}>
        {state === "loading"
          ? "Preparo l'audio…"
          : state === "playing"
            ? "Ferma"
            : detail
              ? "Ascolta il dettaglio"
              : "Ascolta il brief"}
      </Button>
      {error && (
        <p role="status" className="text-sm font-semibold text-bad">
          Errore. <span className="font-normal text-foreground">{error}</span>
        </p>
      )}
    </div>
  );
}
