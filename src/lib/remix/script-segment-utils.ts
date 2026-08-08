export interface ScriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  isEdited?: boolean;
}

export interface TextOnScreenOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  position: { x: number; y: number };
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  bgColor: string;
  animation: 'none' | 'fade_in' | 'fade_out' | 'slide_up' | 'slide_down' | 'scale_in';
}

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function autoSplitSegments(duration: number, intervalSec = 15): ScriptSegment[] {
  if (duration <= 0) return [{ id: genId(), start: 0, end: 0, text: '' }];
  const segments: ScriptSegment[] = [];
  let t = 0;
  while (t < duration) {
    const end = Math.min(t + intervalSec, duration);
    segments.push({ id: genId(), start: t, end, text: '' });
    t = end;
  }
  return segments;
}

export function parseScriptToSegments(
  script: string,
  subtitles?: Array<{ start: number; end: number; text: string }>,
): ScriptSegment[] {
  if (subtitles && subtitles.length > 0) {
    return subtitles.map((s) => ({ id: genId(), start: s.start, end: s.end, text: s.text }));
  }
  if (!script.trim()) return [{ id: genId(), start: 0, end: 0, text: '' }];
  return [{ id: genId(), start: 0, end: 0, text: script.trim() }];
}

export function segmentsToScript(segments: ScriptSegment[]): string {
  return segments.filter((s) => s.text.trim()).map((s) => s.text.trim()).join(' ');
}

export function mergeAdjacentSegments(segments: ScriptSegment[], indexA: number): ScriptSegment[] {
  if (indexA < 0 || indexA >= segments.length - 1) return segments;
  const a = segments[indexA];
  const b = segments[indexA + 1];
  const merged: ScriptSegment = { id: genId(), start: a.start, end: b.end, text: [a.text, b.text].filter(Boolean).join(' '), isEdited: true };
  return [...segments.slice(0, indexA), merged, ...segments.slice(indexA + 2)];
}

export function insertSegmentAfter(segments: ScriptSegment[], afterIndex: number): ScriptSegment[] {
  if (afterIndex < 0 || afterIndex >= segments.length) return segments;
  const seg = segments[afterIndex];
  const mid = (seg.start + seg.end) / 2;
  const left: ScriptSegment = { ...seg, id: genId(), end: mid };
  const right: ScriptSegment = { id: genId(), start: mid, end: seg.end, text: '' };
  return [...segments.slice(0, afterIndex), left, right, ...segments.slice(afterIndex + 1)];
}

export function removeSegment(segments: ScriptSegment[], index: number): ScriptSegment[] {
  if (segments.length <= 1) return [{ ...segments[0], text: '' }];
  return segments.filter((_, i) => i !== index);
}

export function formatTimeMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function parseMMSS(value: string): number {
  const parts = value.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  return parseFloat(value) || 0;
}
