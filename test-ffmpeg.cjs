const youtubedlFactory = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

async function test() {
  const youtubedl = youtubedlFactory.create('./node_modules/youtube-dl-exec/bin/yt-dlp');
  const tempOut = path.join(os.tmpdir(), `ytdl-${crypto.randomUUID()}.mp4`);
  console.log("Downloading to", tempOut);
  try {
    await youtubedl("https://www.facebook.com/watch/?v=878292981679530", {
      output: tempOut,
      format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      noWarnings: true,
      preferFreeFormats: true,
      ffmpegLocation: ffmpegPath
    });
    console.log("Success! File exists:", fs.existsSync(tempOut));
  } catch (err) {
    console.error("Failed:", err.message);
  } finally {
    if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
  }
}
test();
