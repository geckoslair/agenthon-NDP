# ElevenLabs credits

Source: event portal, "Resources" tab, snapshot 10:37 on 21 November 2026.
**Project use only**: runtime features and pitch material, not development.

## Getting access

Each participant gets a coupon (Creator plan) from a bot on the ElevenLabs
Discord server: join the server, open the `coupon-codes` channel, click
"Start Redemption", select the event "AGENTHON: Waiting for DevFest Alps" and
fill in the form with the email used to register. Each team member redeems
their own.

## Usage rules

1. For voice, use the **API, not the web apps**, so the credits last.
2. Create an API key in the ElevenLabs account and keep it in
   `ELEVENLABS_API_KEY` in `.env`. Never in the code: the repository is
   public.
3. Use the official ElevenLabs SDK for TypeScript, and the models that spend
   the fewest credits for good enough quality. Check model ids and credit
   costs in the current ElevenLabs docs before use.
4. Image and video generation (Veo 3.1, Kling, Seedance) is available in the
   ElevenLabs **app** on the Creator plan; through the API it needs the Pro
   plan. It costs the same credits either way.

## Why it matters

There is a special prize, **Best use of ElevenLabs**, awarded by the two
juries together to one project across both tracks. Capabilities the portal
names: text to speech, speech to text, sound effects, conversational agents.

## Pitch video (optional)

The portal suggests generating clips with Veo or ElevenLabs Image & Video,
the voice-over with ElevenLabs, and editing with HyperFrames (HeyGen's open
source HTML-to-MP4 tool): `npx hyperframes skills update`, then ask the
agent to make the video.
