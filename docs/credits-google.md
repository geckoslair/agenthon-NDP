# Google Cloud credits (Vertex AI)

Source: event portal, "Resources" tab, snapshot 10:37 on 21 November 2026.
Model ids and prices are copied from the portal; do not change them from
memory. **Project use only**: runtime features and pitch material, not
development.

## How the credits work

- 30 USD per person, claimed with a personal Gmail account at
  `g.dev/credits/devfest-alps-2026`. They last **12 hours** from the claim
  and stay with the account that claims them.
- Each team member claims their own and uses their own GCP project.
- The balance takes about an hour to update.

## Setup rules

1. Create a GCP project linked to the billing account that holds the
   credits, enable the Vertex AI API (`aiplatform.googleapis.com`, the
   console calls it Agent Platform API) and authenticate locally with gcloud
   Application Default Credentials.
2. Call Gemini **through Vertex AI**, never through the Gemini API in Google
   AI Studio: the credits do not cover AI Studio.
3. Use GA models only, never a `-preview` model.
4. Veo runs only in `us-central1`. With the google-genai SDK pass the project
   and that location; an API key alone fails for Veo
   (`RESOURCE_PROJECT_INVALID`).
5. Nano Banana: about **one request a minute per project** on event credits.
   Space the calls and retry after a pause on 429.
6. Avoid the Turin and Doha regions (`europe-west12`, `me-central1`).

## Models and prices

| Use   | Model id                                                    | Price                                                                    | 30 USD buys                          |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| Text  | `gemini-3.8-flash`                                          | 0.75 USD/M tokens in, 3.75 out (until 31 Dec). Thinking counts as output | ~5,700 calls of 2,000 in / 1,000 out |
| Image | `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite)          | 0.034 USD/image                                                          | ~880 images                          |
| Image | `gemini-3.1-flash-image` (Nano Banana 2)                    | 0.067 USD/image at 1K                                                    | ~450 images                          |
| Image | `gemini-3-pro-image` (Nano Banana Pro)                      | ~0.13 USD/image at 1K                                                    | ~220 images                          |
| Video | `veo-3.1-generate-001` with audio                           | 0.40 USD/second                                                          | ~75 seconds                          |
| Video | `veo-3.1-generate-001` without audio                        | 0.20 USD/second                                                          | ~150 seconds                         |
| Video | `veo-3.1-fast-generate-001` with audio                      | 0.10 USD/second at 720p                                                  | ~300 seconds                         |
| Video | `veo-3.1-lite-generate-001` (Preview, coverage unconfirmed) | 0.05 USD/second at 720p                                                  | ~600 seconds                         |

Other GA text models named by the portal as fine: `gemini-3.5-flash`,
`gemini-3.1-flash-lite`.

Video burns credits fastest: test a prompt on a 4-second clip, without audio
when it is not needed.

## Covered

- Vertex AI: Gemini, Veo, Nano Banana, Lyria, embeddings, Speech-to-Text,
  Text-to-Speech, Translation, Vision.
- Cloud Run, Cloud Functions, App Engine, Compute Engine standard VMs.
- Firebase (Blaze): Hosting, Firestore, Auth, Storage, Functions.
- Cloud SQL, Firestore, Cloud Storage (Standard), BigQuery queries.
- Google Maps Platform.

## Not covered, or at risk

- Gemini API through Google AI Studio.
- Marketplace and partner models (Claude, Llama most likely too).
- Some GPUs and TPUs, memory- or compute-optimised VMs, Spot VMs.
- GKE (use Cloud Run).
- Archive and Coldline storage, BigQuery physical storage, database backups.
- Preview models (`-preview`, Veo 3.1 Lite): unconfirmed by Google. Test one
  call and check the balance an hour later before relying on them.
