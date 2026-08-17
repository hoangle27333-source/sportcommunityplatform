import youtubedlFactory from 'youtube-dl-exec';
import { config } from 'dotenv';
config({ path: '.env.local' });

const youtubedl = youtubedlFactory.create('./node_modules/youtube-dl-exec/bin/yt-dlp');

async function run() {
  const url = "https://www.instagram.com/p/DbWyPbKvjEY/";
  const ytOptions = {
    dumpJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    cookiesFromBrowser: "chrome"
  };

  try {
    console.log("Running youtubedl with options:", ytOptions);
    const result = await youtubedl(url, ytOptions);
    console.log("Success! ID:", (result as any).id, "Title:", (result as any).title);
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
