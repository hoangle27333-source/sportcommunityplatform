import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="Voice Pipeline", version="2.0")

_WHISPERX_MODEL: Any | None = None
_WHISPERX_MODEL_KEY: tuple[str, str, str] | None = None


class AnalyzeRequest(BaseModel):
  audioPath: str | None = None
  audioBase64: str | None = None
  targetLanguage: Literal["vi", "en"] = "vi"
  durationSec: float | None = None


class WordTimestamp(BaseModel):
  word: str
  startSec: float
  endSec: float
  confidence: float | None = None
  segmentIndex: int | None = None


class SpeechSegment(BaseModel):
  startSec: float
  endSec: float
  confidence: float | None = None


class SentenceCue(BaseModel):
  startSec: float
  endSec: float
  sourceText: str
  confidence: float | None = None
  words: list[WordTimestamp] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
  language: str | None = None
  speechSegments: list[SpeechSegment]
  wordTimestamps: list[WordTimestamp]
  sentenceCues: list[SentenceCue]
  diagnostics: dict[str, Any]


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
  started = time.time()
  audio_path, cleanup_path = resolve_audio_path(req)
  provider = os.getenv("VOICE_ALIGNMENT_PROVIDER", "whisperx").lower()
  warnings: list[str] = []

  try:
    try:
      if provider == "stable-ts":
        result = analyze_with_stable_ts(audio_path)
      else:
        result = analyze_with_whisperx(audio_path)
    except Exception as primary_error:
      if provider != "stable-ts":
        warnings.append(f"whisperx failed, trying stable-ts: {primary_error}")
        result = analyze_with_stable_ts(audio_path)
        result["diagnostics"]["fallbackProvider"] = "stable-ts"
      else:
        raise

    words = clamp_words(result["wordTimestamps"], req.durationSec)
    speech_segments = clamp_segments(result["speechSegments"], req.durationSec)
    words = assign_words_to_speech_segments(words, speech_segments)
    sentence_cues = build_sentence_cues(words, speech_segments, req.durationSec)
    if not sentence_cues and result["segments"]:
      sentence_cues = sentence_cues_from_segments(result["segments"], req.durationSec)
    if not sentence_cues:
      raise HTTPException(status_code=422, detail="No aligned sentence cues were detected.")

    confidences = [w.confidence for w in words if w.confidence is not None]
    diagnostics = {
      **result["diagnostics"],
      "warnings": [*warnings, *result["diagnostics"].get("warnings", [])],
      "speechSegmentCount": len(speech_segments),
      "wordCount": len(words),
      "sentenceCueCount": len(sentence_cues),
      "averageConfidence": sum(confidences) / len(confidences) if confidences else None,
      "elapsedMs": round((time.time() - started) * 1000),
    }

    return AnalyzeResponse(
      language=result.get("language"),
      speechSegments=speech_segments,
      wordTimestamps=words,
      sentenceCues=sentence_cues,
      diagnostics=diagnostics,
    )
  except HTTPException:
    raise
  except Exception as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    if cleanup_path:
      Path(cleanup_path).unlink(missing_ok=True)


def resolve_audio_path(req: AnalyzeRequest) -> tuple[str, str | None]:
  if req.audioBase64:
    raw = base64.b64decode(req.audioBase64)
    fd, p = tempfile.mkstemp(prefix="voice-pipeline-", suffix=".mp3")
    with os.fdopen(fd, "wb") as f:
      f.write(raw)
    return p, p
  if req.audioPath and Path(req.audioPath).exists():
    return req.audioPath, None
  raise HTTPException(status_code=422, detail="audioPath not found and audioBase64 was not provided.")


def analyze_with_whisperx(audio_path: str) -> dict[str, Any]:
  global _WHISPERX_MODEL, _WHISPERX_MODEL_KEY
  import torch
  import whisperx

  device = "cuda" if torch.cuda.is_available() else "cpu"
  model_name = os.getenv("WHISPERX_MODEL", "large-v3" if device == "cuda" else "small")
  compute_type = os.getenv("WHISPERX_COMPUTE_TYPE", "float16" if device == "cuda" else "int8")
  batch_size = int(os.getenv("WHISPERX_BATCH_SIZE", "8" if device == "cuda" else "4"))
  key = (model_name, device, compute_type)
  if _WHISPERX_MODEL is None or _WHISPERX_MODEL_KEY != key:
    _WHISPERX_MODEL = whisperx.load_model(model_name, device, compute_type=compute_type)
    _WHISPERX_MODEL_KEY = key

  audio = whisperx.load_audio(audio_path)
  result = _WHISPERX_MODEL.transcribe(audio, batch_size=batch_size)
  language = result.get("language")
  segments = result.get("segments") or []
  warnings: list[str] = []

  if language:
    try:
      align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
      result = whisperx.align(segments, align_model, metadata, audio, device, return_char_alignments=False)
      segments = result.get("segments") or segments
    except Exception as exc:
      warnings.append(f"forced alignment failed; using ASR segment timing: {exc}")

  words = words_from_segments(segments)
  speech_segments = detect_speech_segments(audio_path) or speech_segments_from_segments(segments)
  return {
    "language": language,
    "segments": segments,
    "speechSegments": speech_segments,
    "wordTimestamps": words,
    "diagnostics": {
      "provider": "whisperx",
      "model": model_name,
      "device": device,
      "computeType": compute_type,
      "language": language,
      "warnings": warnings,
    },
  }


def analyze_with_stable_ts(audio_path: str) -> dict[str, Any]:
  import stable_whisper

  model_name = os.getenv("STABLE_TS_MODEL", "small")
  model = stable_whisper.load_model(model_name)
  result = model.transcribe(audio_path, word_timestamps=True, vad=True)
  data = result.to_dict() if hasattr(result, "to_dict") else result.to_json()
  if isinstance(data, str):
    import json
    data = json.loads(data)
  segments = data.get("segments") or []
  speech_segments = detect_speech_segments(audio_path) or speech_segments_from_segments(segments)
  return {
    "language": data.get("language"),
    "segments": segments,
    "speechSegments": speech_segments,
    "wordTimestamps": words_from_segments(segments),
    "diagnostics": {
      "provider": "stable-ts",
      "model": model_name,
      "language": data.get("language"),
      "warnings": [],
    },
  }


def words_from_segments(segments: list[dict[str, Any]]) -> list[WordTimestamp]:
  words: list[WordTimestamp] = []
  for segment in segments:
    for raw in segment.get("words") or []:
      word = str(raw.get("word") or raw.get("text") or "").strip()
      start = raw.get("start")
      end = raw.get("end")
      if word and is_number(start) and is_number(end) and float(end) >= float(start):
        words.append(WordTimestamp(
          word=word,
          startSec=round(float(start), 3),
          endSec=round(float(end), 3),
          confidence=float(raw["score"]) if is_number(raw.get("score")) else None,
        ))
  if words:
    return words
  for segment in segments:
    text = str(segment.get("text") or "").strip()
    start = segment.get("start")
    end = segment.get("end")
    if text and is_number(start) and is_number(end) and float(end) > float(start):
      words.append(WordTimestamp(word=text, startSec=round(float(start), 3), endSec=round(float(end), 3)))
  return words


def speech_segments_from_segments(segments: list[dict[str, Any]]) -> list[SpeechSegment]:
  out: list[SpeechSegment] = []
  for segment in segments:
    start = segment.get("start")
    end = segment.get("end")
    if is_number(start) and is_number(end) and float(end) > float(start):
      out.append(SpeechSegment(startSec=round(float(start), 3), endSec=round(float(end), 3)))
  return merge_segments(out)


def build_sentence_cues(
  words: list[WordTimestamp],
  speech_segments: list[SpeechSegment],
  duration_sec: float | None,
) -> list[SentenceCue]:
  if not words:
    return []
  max_duration = float(os.getenv("VOICE_MAX_CUE_DURATION_SEC", "6"))
  max_chars = int(os.getenv("VOICE_MAX_CHARS_PER_CUE", "90"))
  pause_gap = int(os.getenv("VOICE_MIN_PAUSE_GAP_MS", "350")) / 1000
  cues: list[SentenceCue] = []
  current: list[WordTimestamp] = []

  for idx, word in enumerate(words):
    current.append(word)
    nxt = words[idx + 1] if idx + 1 < len(words) else None
    text = join_words(current)
    duration = current[-1].endSec - current[0].startSec
    gap = (nxt.startSec - word.endSec) if nxt else 999
    segment_changed = (
      nxt is not None
      and word.segmentIndex is not None
      and nxt.segmentIndex is not None
      and nxt.segmentIndex != word.segmentIndex
    )
    punct_end = text.rstrip().endswith((".", "!", "?", "。", "！", "？"))
    soft_break = text.rstrip().endswith((",", ";", ":", "…"))
    should_flush = (
      nxt is None
      or segment_changed
      or punct_end
      or (duration >= max_duration and (gap >= pause_gap or len(text) >= max_chars))
      or (len(text) >= max_chars and (gap >= pause_gap or soft_break))
    )
    if should_flush:
      cues.append(make_sentence_cue(current, speech_segments, duration_sec))
      current = []

  if current:
    cues.append(make_sentence_cue(current, speech_segments, duration_sec))
  return merge_short_cues(cues)


def sentence_cues_from_segments(segments: list[dict[str, Any]], duration_sec: float | None) -> list[SentenceCue]:
  cues: list[SentenceCue] = []
  for segment in segments:
    text = str(segment.get("text") or "").strip()
    start = segment.get("start")
    end = segment.get("end")
    if text and is_number(start) and is_number(end) and float(end) > float(start):
      cue = SentenceCue(startSec=round(float(start), 3), endSec=round(float(end), 3), sourceText=text)
      cues.append(clamp_sentence(cue, duration_sec))
  return cues


def make_sentence_cue(
  words: list[WordTimestamp],
  speech_segments: list[SpeechSegment],
  duration_sec: float | None,
) -> SentenceCue:
  confidences = [w.confidence for w in words if w.confidence is not None]
  segment_indexes = [w.segmentIndex for w in words if w.segmentIndex is not None]
  start_sec = words[0].startSec
  end_sec = max(words[-1].endSec, words[0].startSec + 0.1)
  if segment_indexes:
    first_idx = max(0, min(segment_indexes))
    last_idx = min(len(speech_segments) - 1, max(segment_indexes))
    if speech_segments:
      start_sec = min(start_sec, speech_segments[first_idx].startSec)
      end_sec = max(end_sec, speech_segments[last_idx].endSec)
  cue = SentenceCue(
    startSec=start_sec,
    endSec=end_sec,
    sourceText=join_words(words),
    confidence=sum(confidences) / len(confidences) if confidences else None,
    words=words,
  )
  return clamp_sentence(cue, duration_sec)


def merge_short_cues(cues: list[SentenceCue]) -> list[SentenceCue]:
  max_chars = int(os.getenv("VOICE_MAX_CHARS_PER_CUE", "90"))
  max_merge_gap = float(os.getenv("VOICE_MAX_CUE_MERGE_GAP_SEC", "0.08"))
  merged: list[SentenceCue] = []
  for cue in cues:
    last = merged[-1] if merged else None
    same_segment_family = cues_share_speech_segment(last, cue) if last else False
    gap_sec = cue.startSec - last.endSec if last else 999
    if (
      last
      and same_segment_family
      and gap_sec <= max_merge_gap
      and len(last.sourceText) + len(cue.sourceText) + 1 <= max_chars
      and cue.endSec - last.startSec <= 6
    ):
      last.endSec = cue.endSec
      last.sourceText = f"{last.sourceText} {cue.sourceText}".strip()
      last.words.extend(cue.words)
      if cue.confidence is not None:
        if last.confidence is None:
          last.confidence = cue.confidence
        else:
          last.confidence = (last.confidence + cue.confidence) / 2
    else:
      merged.append(cue)
  return merged


def cues_share_speech_segment(left: SentenceCue, right: SentenceCue) -> bool:
  left_indexes = sorted({w.segmentIndex for w in left.words if w.segmentIndex is not None})
  right_indexes = sorted({w.segmentIndex for w in right.words if w.segmentIndex is not None})
  if not left_indexes or not right_indexes:
    return False
  return left_indexes[-1] == right_indexes[0]


def detect_speech_segments(audio_path: str) -> list[SpeechSegment]:
  try:
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad, read_audio

    sample_rate = 16000
    min_silence_ms = int(os.getenv("VOICE_MIN_PAUSE_GAP_MS", "350"))
    speech_pad_ms = int(os.getenv("VOICE_SPEECH_PAD_MS", "120"))
    threshold = float(os.getenv("VOICE_VAD_THRESHOLD", "0.5"))
    audio = read_audio(audio_path, sampling_rate=sample_rate)
    if hasattr(audio, "numpy"):
      audio = audio
    model = load_silero_vad()
    timestamps = get_speech_timestamps(
      audio,
      model,
      sampling_rate=sample_rate,
      min_silence_duration_ms=min_silence_ms,
      speech_pad_ms=speech_pad_ms,
      threshold=threshold,
    )
    segments = [
      SpeechSegment(
        startSec=round(float(item["start"]) / sample_rate, 3),
        endSec=round(float(item["end"]) / sample_rate, 3),
      )
      for item in timestamps
      if item.get("end", 0) > item.get("start", 0)
    ]
    return merge_segments(segments)
  except Exception:
    return []


def assign_words_to_speech_segments(
  words: list[WordTimestamp],
  speech_segments: list[SpeechSegment],
) -> list[WordTimestamp]:
  if not words or not speech_segments:
    return words
  out: list[WordTimestamp] = []
  for word in words:
    segment_index = find_segment_index_for_word(word, speech_segments)
    out.append(
      WordTimestamp(
        word=word.word,
        startSec=word.startSec,
        endSec=word.endSec,
        confidence=word.confidence,
        segmentIndex=segment_index,
      )
    )
  return out


def find_segment_index_for_word(word: WordTimestamp, speech_segments: list[SpeechSegment]) -> int | None:
  word_mid = (word.startSec + word.endSec) / 2
  best_idx: int | None = None
  best_distance = 10**9
  for idx, segment in enumerate(speech_segments):
    overlap = min(word.endSec, segment.endSec) - max(word.startSec, segment.startSec)
    if overlap >= -0.02:
      return idx
    if word_mid < segment.startSec:
      distance = segment.startSec - word_mid
    elif word_mid > segment.endSec:
      distance = word_mid - segment.endSec
    else:
      distance = 0
    if distance < best_distance:
      best_distance = distance
      best_idx = idx
  return best_idx


def join_words(words: list[WordTimestamp]) -> str:
  text = " ".join(w.word.strip() for w in words if w.word.strip())
  return text.replace(" ,", ",").replace(" .", ".").replace(" !", "!").replace(" ?", "?").replace(" :", ":").replace(" ;", ";").strip()


def clamp_words(words: list[WordTimestamp], duration_sec: float | None) -> list[WordTimestamp]:
  if not duration_sec or duration_sec <= 0:
    return words
  out = []
  for word in words:
    start = max(0, min(word.startSec, duration_sec - 0.01))
    end = max(start, min(word.endSec, duration_sec))
    if end > start:
      out.append(WordTimestamp(word=word.word, startSec=round(start, 3), endSec=round(end, 3), confidence=word.confidence))
  return out


def clamp_segments(segments: list[SpeechSegment], duration_sec: float | None) -> list[SpeechSegment]:
  return merge_segments([clamp_segment(s, duration_sec) for s in segments])


def clamp_segment(segment: SpeechSegment, duration_sec: float | None) -> SpeechSegment:
  if not duration_sec or duration_sec <= 0:
    return segment
  start = max(0, min(segment.startSec, duration_sec - 0.01))
  end = max(start, min(segment.endSec, duration_sec))
  return SpeechSegment(startSec=round(start, 3), endSec=round(end, 3), confidence=segment.confidence)


def clamp_sentence(cue: SentenceCue, duration_sec: float | None) -> SentenceCue:
  if not duration_sec or duration_sec <= 0:
    return cue
  cue.startSec = round(max(0, min(cue.startSec, duration_sec - 0.01)), 3)
  cue.endSec = round(max(cue.startSec + 0.01, min(cue.endSec, duration_sec)), 3)
  return cue


def merge_segments(segments: list[SpeechSegment]) -> list[SpeechSegment]:
  merged: list[SpeechSegment] = []
  for segment in sorted(segments, key=lambda s: s.startSec):
    last = merged[-1] if merged else None
    if last and segment.startSec - last.endSec <= 0.12:
      last.endSec = max(last.endSec, segment.endSec)
    else:
      merged.append(segment)
  return merged


def is_number(value: Any) -> bool:
  try:
    float(value)
    return True
  except (TypeError, ValueError):
    return False
