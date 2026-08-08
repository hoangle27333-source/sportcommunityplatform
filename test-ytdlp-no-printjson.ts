import ytdlFactory from 'youtube-dl-exec';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { config } from 'dotenv';
import { stat } from 'fs/promises';
config({ path: '.env.local' });

const YTDLP_BIN = process.env.YTDLP_PATH ?? './node_modules/youtube-dl-exec/bin/yt-dlp';
console.log("Using binary:", YTDLP_BIN);
const youtubedl = ytdlFactory.create(YTDLP_BIN);

async function run() {
  const url = "https://youtube.com/shorts/z1ASOypHtBs?si=2xj_xY_-1ocvluS2";
  const tempId = `ytdl-${crypto.randomUUID()}`;
  const tempDir = tmpdir();
  const tempTemplate = path.join(tempDir, `${tempId}.%(ext)s`);
  
  const ytOptions: Record<string, any> = {
    output: tempTemplate,
    format: "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best",
    mergeOutputFormat: "mp4",
    noWarnings: true,
    noCheckCertificates: true,
    forceOverwrites: true,
    retries: 3,
    fragmentRetries: 3,
    extractorRetries: 3,
    fileAccessRetries: 3,
    "cookies-from-browser": "firefox"
  };

  try {
    const res = await youtubedl(url, ytOptions, { env: process.env });
    console.log("Success!");
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(tempDir);
    const downloaded = files.filter(f => f.startsWith(tempId));
    console.log("Downloaded:", downloaded);
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
