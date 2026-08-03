/**
 * `ffprobe-static` ships no type declarations. It exports the absolute path to
 * a platform-specific ffprobe binary, which is all we use (see
 * src/lib/remix/video-ops.ts).
 */
declare module "ffprobe-static" {
  const ffprobe: { path: string };
  export default ffprobe;
}
