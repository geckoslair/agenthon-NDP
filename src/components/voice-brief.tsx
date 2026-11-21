// The spoken brief card. Server component: reads the brief text; the button is a client island.
import { ListenButton } from "@/components/listen-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { buildBrief, buildShortBrief } from "@/lib/voice/brief";

export function VoiceBrief() {
  const db = getDb();
  const summary = buildShortBrief(db);
  const detail = buildBrief(db);
  return (
    <Card>
      <CardHeader>
        <p className="eyebrow">Brief del giro</p>
        <CardTitle>Cosa è successo, a voce</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-lg leading-relaxed" data-testid="brief-text">
          {summary}
        </p>
        <div className="flex flex-wrap gap-2">
          <ListenButton />
          <ListenButton detail />
        </div>
        <details open>
          <summary className="cursor-pointer text-sm font-semibold">Dettaglio per fattura</summary>
          <p className="mt-2 leading-relaxed text-ink-2" data-testid="brief-detail">
            {detail}
          </p>
        </details>
        <p className="text-sm text-ink-2">
          La voce legge soltanto. Le approvazioni restano un clic, sulla pagina Approvazioni.
        </p>
      </CardContent>
    </Card>
  );
}
