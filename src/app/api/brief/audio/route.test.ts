import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/brief/audio", () => {
  it("answers 503 with a clear JSON message when there is no key and nothing cached", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probata-route-"));
    vi.stubEnv("DATABASE_PATH", path.join(tmp, "app.db"));
    vi.stubEnv("VOICE_CACHE_DIR", path.join(tmp, "voice"));
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/brief/audio"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("voice_unavailable");
    expect(body.message).toContain("ELEVENLABS_API_KEY");
  });

  it("serves a cached brief without a key", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probata-route-"));
    vi.stubEnv("DATABASE_PATH", path.join(tmp, "app.db"));
    vi.stubEnv("VOICE_CACHE_DIR", path.join(tmp, "voice"));
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { cacheKey, DEFAULT_MODEL, DEFAULT_VOICE } = await import("@/lib/voice/tts");
    fs.mkdirSync(path.join(tmp, "voice"));
    fs.writeFileSync(
      path.join(
        tmp,
        "voice",
        `${cacheKey("Nessun giro eseguito.", DEFAULT_MODEL, DEFAULT_VOICE)}.mp3`,
      ),
      Buffer.from([1, 2, 3]),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/brief/audio"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("x-brief-cache")).toBe("hit");
  });
});
