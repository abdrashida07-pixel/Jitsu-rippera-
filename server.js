import "dotenv/config";
import express from "express";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { Client, handle_file } from "@gradio/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SPACE_ID = String(process.env.HF_SPACE_ID || "").trim();
const HF_TOKEN = String(process.env.HF_TOKEN || "").trim();
const MAX_REFS = 1;
const MAX_PROMPT = 4000;
const jobs = new Map();

const uploadDir = path.join(os.tmpdir(), "genjutsu-uploads");
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 200 * 1024 * 1024 }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function configured() {
  return Boolean(SPACE_ID && SPACE_ID.includes("/"));
}

function cleanUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.url || value.path || value.name || value.video?.url || null;
}

function normalizeResult(data) {
  const first = Array.isArray(data) ? data[0] : data;
  const url = cleanUrl(first);
  return { url, raw: data };
}

async function getClient() {
  if (!configured()) {
    throw new Error("HF_SPACE_ID is missing. Add your Hugging Face Space ID in Render → Environment Variables.");
  }
  return Client.connect(SPACE_ID, HF_TOKEN ? { token: HF_TOKEN } : {});
}

async function removeLater(files) {
  setTimeout(async () => {
    for (const file of files) {
      try { await fs.unlink(file); } catch {}
    }
  }, 10 * 60 * 1000);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured,
    provider: "Hugging Face ZeroGPU",
    space: SPACE_ID || null,
    model: "Wan 2.2 Animate",
    limits: { references: MAX_REFS, maxPrompt: MAX_PROMPT }
  });
});

app.post("/api/generate", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "reference", maxCount: 1 }
]), async (req, res) => {
  const video = req.files?.video?.[0];
  const reference = req.files?.reference?.[0];
  const prompt = String(req.body?.prompt || "the person is moving naturally").slice(0, MAX_PROMPT);

  if (!video) return res.status(400).json({ ok: false, error: "Add a source video first." });
  if (!reference) return res.status(400).json({ ok: false, error: "Add one reference image." });

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: "queued", createdAt: Date.now() });
  res.json({ ok: true, request_id: jobId });

  (async () => {
    const files = [video.path, reference.path];
    try {
      jobs.set(jobId, { status: "connecting", createdAt: Date.now() });
      const client = await getClient();
      jobs.set(jobId, { status: "queued", createdAt: Date.now() });

      const job = client.submit("/generate_video", [
        handle_file(reference.path),
        480,
        832,
        handle_file(video.path),
        480,
        832,
        120,
        prompt,
        ""
      ]);

      for await (const event of job) {
        if (event.type === "status") {
          const s = event.stage || "processing";
          jobs.set(jobId, {
            status: s === "complete" ? "completed" : s,
            position: event.position ?? null,
            eta: event.eta ?? null,
            progress: event.progress_data?.[0]?.progress ?? null,
            createdAt: jobs.get(jobId)?.createdAt || Date.now()
          });
        } else if (event.type === "data") {
          const result = normalizeResult(event.data);
          if (result.url) {
            jobs.set(jobId, { status: "completed", videoUrl: result.url, createdAt: jobs.get(jobId)?.createdAt || Date.now() });
          }
        }
      }

      const current = jobs.get(jobId);
      if (current?.videoUrl) return;
      // Some Gradio versions emit the final data only through the iterator's final message.
      jobs.set(jobId, { ...current, status: "completed" });
    } catch (error) {
      console.error("[generate]", error);
      jobs.set(jobId, { status: "failed", error: error?.message || String(error), createdAt: jobs.get(jobId)?.createdAt || Date.now() });
    } finally {
      await removeLater(files);
    }
  })();
});

app.get("/api/status/:requestId", (req, res) => {
  const job = jobs.get(req.params.requestId);
  if (!job) return res.status(404).json({ ok: false, error: "Generation not found or server restarted." });
  res.json({ ok: true, ...job });
});

app.post("/api/cancel/:requestId", (_req, res) => {
  // Gradio jobs cannot always be canceled once GPU work has started.
  // The endpoint is kept so the existing UI can stop polling cleanly.
  res.json({ ok: true });
});

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log(`Genjutsu Studio running on port ${PORT}`));
