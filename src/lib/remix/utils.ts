/**
 * Pure utility functions for the remix module that are safe to use in both
 * Node.js (backend) and browser (frontend/React) environments.
 */

/**
 * Làm sạch văn bản transcript (chủ yếu là SRT), loại bỏ các thông tin
 * không cần thiết như số thứ tự cue, timestamps (vd: 00:00:00,100 --> ...)
 * để lấy nội dung thuần túy.
 */
export function sanitizeTranscriptText(script: string): string {
  return script
    // Remove plain SRT numbering lines.
    .replace(/^\s*\d{1,4}\s*$/gm, "")
    // Remove full-range timestamps.
    .replace(/\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}\s*-->\s*\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}/g, "")
    .replace(/\d{1,2}:\d{2}:\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{3}/g, "")
    // Remove standalone timestamp tokens, including bare mm:ss like "00:03".
    .replace(/\b\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\b/g, "")
    .replace(/\b\d{1,2}:\d{2}[,.]\d{1,3}\b/g, "")
    .replace(/\b\d{1,2}:\d{2}:\d{3}\b/g, "")
    .replace(/\b\d{1,2}:\d{2},\d{3}\b/g, "")
    .replace(/^\s*\d{1,2}:\d{2}\s*$/gm, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/-->+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
