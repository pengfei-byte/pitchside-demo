import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMatch } from "./match.js";
import { COMMENTATOR, characterPrompt, scenePrompt } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const BASE = process.env.POPVID_BASE_URL || "https://popvid.ai/api/public/v1";
const KEY = process.env.POPVID_API_KEY;
const SEED_BASE = (process.env.SEED_BASE_URL || "").replace(/\/$/, "");
const SEED_IMAGE_URL = (process.env.SEED_IMAGE_URL || "").trim();
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const ANCHOR_ASSET = "/commentator.jpg";
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_SESSIONS || 3);
const CONNECT_LIMIT = Number(process.env.CONNECT_LIMIT_PER_IP || 12);
const CONNECT_WINDOW_MS = 15 * 60 * 1000;
const HARD_CLOSE_MS = 300_000;

const sessions = new Map();
const connectHits = new Map();

if (!KEY) {
  console.warn("Missing POPVID_API_KEY — broadcast will fall back to teleprompter");
}

app.set("trust proxy", true);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function publicOrigin(req) {
  if (PUBLIC_BASE) return PUBLIC_BASE;
  const xfProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const xfHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = xfHost || req?.headers?.host || "";
  const proto = xfProto || (req?.protocol === "https" || req?.secure ? "https" : "http");
  if (!host || /localhost|127\.0\.0\.1/i.test(host)) return "";
  return `${proto}://${host}`;
}

function seedUrl(req) {
  if (SEED_IMAGE_URL) return SEED_IMAGE_URL;
  if (SEED_BASE) return `${SEED_BASE}${ANCHOR_ASSET}`;
  const origin = publicOrigin(req);
  return origin ? `${origin}${ANCHOR_ASSET}` : null;
}

function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function allowConnect(ip) {
  const now = Date.now();
  const recent = (connectHits.get(ip) || []).filter((t) => now - t < CONNECT_WINDOW_MS);
  if (recent.length >= CONNECT_LIMIT) return false;
  recent.push(now);
  connectHits.set(ip, recent);
  return true;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

async function createPopvidSession({ match, dropSeed = false, req = null }) {
  const body = {
    model: "r2-realtime-v1",
    character: {
      name: COMMENTATOR.name,
      prompt: characterPrompt(),
    },
    scene: { prompt: scenePrompt() },
    language: "en",
    limits: { max_duration_ms: 300_000, max_turns: 80, turn_rate_per_min: 30 },
    credentials_ttl_ms: 600_000,
    metadata: {
      product: "pitchside",
      match: match.id,
    },
  };
  const url = dropSeed ? null : seedUrl(req);
  if (url) body.seed_image_url = url;
  console.log("[broadcast] seed", url || "(none)");

  const res = await fetch(`${BASE}/connections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function closeRemote(sessionId) {
  const row = sessions.get(sessionId);
  if (row?.timer) clearTimeout(row.timer);
  sessions.delete(sessionId);
  if (!KEY || !sessionId) return { ok: true, status: 200, data: { ok: true } };
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok || res.status === 404, status: res.status, data };
}

function trackSession({ sessionId, ip }) {
  const timer = setTimeout(() => {
    closeRemote(sessionId).catch(() => {});
  }, HARD_CLOSE_MS);
  sessions.set(sessionId, {
    ip,
    createdAt: Date.now(),
    lastLease: Date.now(),
    timer,
  });
}

function publicMatch(match) {
  return {
    id: match.id,
    videoId: match.videoId,
    duration: match.duration,
    competition: match.competition,
    title: match.title,
    venue: match.venue,
    kickoff: match.kickoff,
    filmed: match.filmed,
    cues: match.cues,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    product: "pitchside",
    title: "Pitchside",
    realtime: Boolean(KEY),
    sessions: sessions.size,
    seed: Boolean(SEED_IMAGE_URL || SEED_BASE || PUBLIC_BASE),
  });
});

app.get("/api/match", (_req, res) => {
  res.json(publicMatch(loadMatch()));
});

app.post("/api/broadcast", async (req, res) => {
  const ip = clientIp(req);
  const match = loadMatch();
  const payload = {
    mode: "text",
    character: COMMENTATOR,
    match: publicMatch(match),
  };

  if (req.body?.prefer_text || !KEY) {
    return res.json({
      ...payload,
      reason: KEY ? "prefer_text" : "misconfigured",
      message: KEY ? "The live picture is off. Try again." : "The live line is not ready. Try again shortly.",
    });
  }

  if (sessions.size >= MAX_CONCURRENT) {
    return res.status(429).json({
      ...payload,
      error: {
        code: "busy",
        message: "The studio is full right now. Try again in a moment.",
        retry_after_ms: 8000,
      },
    });
  }

  if (!allowConnect(ip)) {
    return res.status(429).json({
      ...payload,
      error: {
        code: "rate_limited",
        message: "Too many joins from this network. Try again in a minute.",
        retry_after_ms: 60_000,
      },
    });
  }

  let result;
  try {
    result = await createPopvidSession({ match, req });
    for (let attempt = 0; attempt < 3 && !result.ok && result.data?.error?.code === "no_capacity"; attempt += 1) {
      const wait = Number(result.data?.error?.retry_after_ms || 5000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      result = await createPopvidSession({ match, req });
    }
  } catch (err) {
    console.error("[broadcast] fetch threw", err);
    return res.status(502).json({
      ...payload,
      error: { code: "upstream_unreachable", message: `Studio unreachable: ${err.message}` },
    });
  }

  if (
    !result.ok &&
    result.data?.error?.code !== "no_capacity" &&
    result.data?.error?.code !== "unauthorized"
  ) {
    result = await createPopvidSession({ match, dropSeed: true, req });
  }

  if (!result.ok) {
    const raw = result.data?.error || {};
    const err = {
      code: raw.code || "upstream",
      message:
        raw.code === "no_capacity"
          ? "The live line is busy right now. Try again in a moment."
          : raw.message || "The live line didn't connect. Try again.",
      status: result.status,
    };
    console.error("[broadcast] rejected", result.status, err);
    return res.status(result.status || 502).json({ ...payload, error: err });
  }

  const { session, credentials } = result.data;
  if (!session?.session_id || !credentials) {
    return res.status(502).json({
      ...payload,
      error: { code: "bad_payload", message: "The live session did not start. Try again." },
    });
  }

  trackSession({ sessionId: session.session_id, ip });

  res.status(201).json({
    mode: "realtime",
    credentials,
    session: {
      session_id: session.session_id,
      reservation_expires_at_ms: session.reservation_expires_at_ms,
      media: session.media,
      hard_close_ms: HARD_CLOSE_MS,
    },
    character: COMMENTATOR,
    match: publicMatch(match),
  });
});

app.post("/api/sessions/:id/heartbeat", (req, res) => {
  const row = sessions.get(req.params.id);
  if (!row) return res.status(404).json({ ok: false });
  row.lastLease = Date.now();
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", async (req, res) => {
  const result = await closeRemote(req.params.id);
  res.status(result.ok ? 200 : result.status).json(result.data || { ok: true });
});

app.post("/api/sessions/:id/close", async (req, res) => {
  await closeRemote(req.params.id);
  res.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pitchside on http://0.0.0.0:${PORT}`);
  });

  setInterval(() => {
    const cutoff = Date.now() - 25_000;
    for (const [id, row] of sessions) {
      if (row.lastLease < cutoff || Date.now() - row.createdAt > HARD_CLOSE_MS + 5_000) {
        closeRemote(id).catch(() => {});
      }
    }
  }, 5_000);
}
