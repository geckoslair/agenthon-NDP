// Simulated session. There is NO authentication in this prototype: the "signed-in" user is a
// made-up demo person from the server environment. Server-side only: the name is never read from
// the browser (no form field, hidden input or query string).

export interface SessionUser {
  name: string;
  simulated: true;
}

export const DEFAULT_DEMO_USER = "Giulia Ferraris";

/** The demo user: PROBATA_DEMO_USER, or "Giulia Ferraris" when unset or blank. */
export function currentUser(env: string | undefined = process.env.PROBATA_DEMO_USER): SessionUser {
  const name = env?.trim().replace(/\s+/g, " ");
  return { name: name ? name : DEFAULT_DEMO_USER, simulated: true };
}
