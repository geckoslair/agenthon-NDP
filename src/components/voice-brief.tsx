// The spoken brief card. Server component: reads the brief text; the button is a client island.
import { ListenButton } from "@/components/listen-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { buildBrief } from "@/lib/voice/brief";

export function VoiceBrief() {
  const text = buildBrief(getDb());
  return (
    <Card>
      <CardHeader>
        <p className="eyebrow">Brief del giro</p>
        <CardTitle>Cosa è successo, a voce</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="leading-relaxed" data-testid="brief-text">
          {text}
        </p>
        <ListenButton />
        <p className="text-sm text-ink-2">
          La voce legge soltanto. Le approvazioni restano un clic, sulla pagina Approvazioni.
        </p>
      </CardContent>
    </Card>
  );
}
