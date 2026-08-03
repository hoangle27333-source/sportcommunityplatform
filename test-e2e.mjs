/**
 * End-to-end test: simulates exactly what the worker does for own_link video jobs
 * Run with: node --env-file=.env.local test-e2e.mjs
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readdir, readFile, writeFile, rm, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const _require = createRequire(import.meta.url);
const _ffmpegPath = _require("ffmpeg-static");
const _ffprobeStatic = _require("ffprobe-static");

console.log("=== Binary resolution ===");
console.log("FFMPEG_PATH env:", JSON.stringify(process.env.FFMPEG_PATH));
console.log("FFPROBE_PATH env:", JSON.stringify(process.env.FFPROBE_PATH));
console.log("ffmpegStatic (createRequire):", JSON.stringify(_ffmpegPath));
console.log("ffprobeStatic (createRequire):", JSON.stringify(_ffprobeStatic?.path));

function ffmpegBin() {
  const e = process.env.FFMPEG_PATH;
  if (e && e.trim()) return e.trim();
  if (_ffmpegPath && _ffmpegPath.trim()) return _ffmpegPath.trim();
  return "ffmpeg";
}

function ffprobeBin() {
  const e = process.env.FFPROBE_PATH;
  if (e && e.trim()) return e.trim();
  if (_ffprobeStatic?.path?.trim()) return _ffprobeStatic.path.trim();
  return "ffprobe";
}

console.log("\nresolved ffmpegBin():", ffmpegBin());
console.log("resolved ffprobeBin():", ffprobeBin());

function run(bin, args) {
  if (!bin || !bin.trim()) return Promise.reject(new Error(`bin is empty!`));
  return new Promise((resolve, reject) => {
    let proc;
    try { proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] }); }
    catch (err) { return reject(new Error(`spawn throw: ${err.message}`)); }
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    proc.on("error", err => reject(new Error(`spawn error: ${err.message}`)));
    proc.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}: ${stderr.slice(-600)}`)));
  });
}

// Step 1: download video
console.log("\n=== Step 1: Downloading video ===");
const youtubedlFactory = _require("youtube-dl-exec");
const youtubedl = youtubedlFactory.create("./node_modules/youtube-dl-exec/bin/yt-dlp");

const tempId = "e2e-" + Math.random().toString(36).slice(2);
const tempTemplate = path.join(tmpdir(), `${tempId}.%(ext)s`);
console.log("Template:", tempTemplate);

await youtubedl("https://www.facebook.com/share/r/1Ue7ZgBQP7/", {
  output: tempTemplate,
  format: "best[ext=mp4]/bestvideo[ext=mp4]/best",
  noWarnings: true,
});

const files = (await readdir(tmpdir())).filter(f => f.startsWith(tempId));
console.log("Downloaded files:", files);
if (!files.length) throw new Error("No file downloaded!");

const srcPath = path.join(tmpdir(), files[0]);
const srcStat = await stat(srcPath);
console.log("Source file size:", srcStat.size, "bytes");

// Step 2: probe video
console.log("\n=== Step 2: Probing video with ffprobe ===");
const probeOut = await run(ffprobeBin(), [
  "-v", "error",
  "-print_format", "json",
  "-show_format",
  "-show_streams",
  srcPath,
]);
const probeJson = JSON.parse(probeOut);
const videoStream = probeJson.streams?.find(s => s.codec_type === "video");
const audioStream = probeJson.streams?.find(s => s.codec_type === "audio");
console.log("Duration:", probeJson.format?.duration);
console.log("Video:", videoStream?.codec_name, videoStream?.width + "x" + videoStream?.height);
console.log("Audio:", audioStream?.codec_name);

// Step 3: apply ffmpeg ops (simulate a simple pass-through encode)
console.log("\n=== Step 3: Running ffmpeg re-encode (simulate ops) ===");
const workDir = await mkdtemp(path.join(tmpdir(), "remix-test-"));
const outPath = path.join(workDir, "out.mp4");

await run(ffmpegBin(), [
  "-y",
  "-i", srcPath,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "23",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-c:a", "aac",
  "-b:a", "128k",
  outPath,
]);

const outStat = await stat(outPath);
console.log("Output file size:", outStat.size, "bytes");

// Cleanup
await rm(srcPath, { force: true });
await rm(workDir, { recursive: true, force: true });

console.log("\n=== SUCCESS: Full pipeline works correctly ===");
