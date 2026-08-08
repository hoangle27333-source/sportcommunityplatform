from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse


app = FastAPI(title="Remix OCR Service", version="1.0.0")


@dataclass
class TextBox:
    text: str
    confidence: float
    box: list[list[float]]
    timestamp_sec: float
    frame_width: int
    frame_height: int


@lru_cache(maxsize=8)
def get_ocr(lang: str):
    from paddleocr import PaddleOCR

    language = lang or "en"
    try:
        return PaddleOCR(
            lang=language,
            use_textline_orientation=True,
            show_log=False,
        )
    except TypeError:
        return PaddleOCR(
            lang=language,
            use_angle_cls=True,
            show_log=False,
            det_db_thresh=0.2,
            det_db_box_thresh=0.3,
            drop_score=0.25,
        )


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr"}


@app.post("/detect-video-text")
async def detect_video_text(
    request: Request,
    file: UploadFile | None = File(default=None),
    durationSec: float | None = Form(default=None),
    sampleTimestamps: str | None = Form(default=None),
    lang: str | None = Form(default=None),
    frameWidthLimit: int | None = Form(default=None),
):
    work_dir = Path(tempfile.mkdtemp(prefix="remix-ocr-"))
    warnings: list[str] = []
    try:
        payload: dict[str, Any] = {}
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = await request.json()

        video_path = await resolve_video_path(file, payload, work_dir)
        duration = float(durationSec if durationSec is not None else payload.get("durationSec", 0) or 0)
        timestamps = parse_timestamps(sampleTimestamps if sampleTimestamps is not None else payload.get("sampleTimestamps"))
        if not timestamps:
            timestamps = build_sample_timestamps(duration)
        timestamps = [clamp(float(ts), 0.0, max(0.0, duration or float(ts))) for ts in timestamps]

        ocr_lang = (lang or payload.get("lang") or os.getenv("PADDLEOCR_LANG") or "en").strip() or "en"
        width_limit = int(frameWidthLimit or payload.get("frameWidthLimit") or 1280)

        boxes: list[TextBox] = []
        for idx, ts in enumerate(timestamps):
            frame_path = work_dir / f"frame-{idx:03d}.jpg"
            extract_frame(video_path, frame_path, ts, width_limit)
            boxes.extend(run_paddleocr(frame_path, ts, ocr_lang, warnings))

        sample_interval = estimate_sample_interval(timestamps)
        blocks = build_frame_blocks(boxes)
        tracks, stats = group_tracks(blocks, duration, sample_interval)
        warnings.append(
            "ocr_stats:"
            f" sampleCount={len(timestamps)}"
            f" rawDetections={len(boxes)}"
            f" frameBlocks={len(blocks)}"
            f" tracks={stats['track_count']}"
            f" splits={stats['split_count']}"
            f" sampleIntervalSec={sample_interval:.3f}"
        )
        return {
            "items": [track for track in tracks if is_output_item(track)],
            "warnings": warnings[:20],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def resolve_video_path(file: UploadFile | None, payload: dict[str, Any], work_dir: Path) -> Path:
    if file is not None:
        suffix = Path(file.filename or "input.mp4").suffix or ".mp4"
        path = work_dir / f"input{suffix}"
        with path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        return path

    video_path = payload.get("videoPath")
    if not isinstance(video_path, str) or not video_path.strip():
        raise HTTPException(status_code=400, detail="Missing file or videoPath")
    path = Path(video_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=400, detail="videoPath does not exist")
    return path


def parse_timestamps(raw: Any) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [float(x) for x in raw if is_number(x)]
    if isinstance(raw, str):
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [float(x) for x in parsed if is_number(x)]
    return []


def build_sample_timestamps(duration_sec: float) -> list[float]:
    duration = max(1.0, duration_sec or 1.0)
    interval = 2.25 if duration <= 60 else 3.0
    max_frames = 18 if duration <= 60 else 24
    count = min(max_frames, max(6, math.ceil(duration / interval)))
    step = duration / count
    timestamps = [clamp(round((step * idx + step / 2) * 10) / 10, 0.2, max(0.2, duration - 0.2)) for idx in range(count)]
    timestamps.insert(0, 0.5)
    timestamps.append(max(0.2, round((duration - 0.5) * 10) / 10))
    return sorted(set(timestamps))[:max_frames]


def extract_frame(video_path: Path, frame_path: Path, timestamp: float, width_limit: int) -> None:
    vf = f"scale={max(320, width_limit)}:-1"
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(timestamp),
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        "-vf",
        vf,
        "-y",
        str(frame_path),
    ]
    subprocess.run(cmd, check=True)


def run_paddleocr(frame_path: Path, timestamp_sec: float, lang: str, warnings: list[str]) -> list[TextBox]:
    import cv2

    image = cv2.imread(str(frame_path))
    if image is None:
        warnings.append(f"Could not read frame at {timestamp_sec:.2f}s")
        return []
    frame_height, frame_width = image.shape[:2]

    ocr = get_ocr(lang)
    try:
        result = run_ocr(ocr, str(frame_path))
    except Exception as exc:
        warnings.append(f"OCR failed at {timestamp_sec:.2f}s: {exc}")
        return []

    rows = flatten_ocr_result(result)
    boxes: list[TextBox] = []
    for box, text, confidence in rows:
        text = normalize_text(text)
        if not text or confidence < 0.25:
            continue
        if is_noise_text(text):
            continue
        boxes.append(
            TextBox(
                text=text,
                confidence=confidence,
                box=box,
                timestamp_sec=timestamp_sec,
                frame_width=frame_width,
                frame_height=frame_height,
            )
        )
    return boxes


def flatten_ocr_result(result: Any) -> list[tuple[list[list[float]], str, float]]:
    rows: list[tuple[list[list[float]], str, float]] = []
    if not result:
        return rows

    if hasattr(result, "to_dict"):
        return flatten_ocr_result(result.to_dict())

    if not isinstance(result, (list, tuple, dict)) and hasattr(result, "__dict__"):
        return flatten_ocr_result(vars(result))

    if isinstance(result, list):
        candidates = result
        if len(result) == 1 and isinstance(result[0], list):
            candidates = result[0]
        for item in candidates:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            box = normalize_box(item[0])
            rec = item[1]
            if box is None:
                continue
            if isinstance(rec, (list, tuple)) and len(rec) >= 2:
                rows.append((box, str(rec[0]), safe_float(rec[1], 0.0)))
            elif isinstance(rec, str):
                rows.append((box, rec, 0.5))
        return rows

    if isinstance(result, dict):
        if "res" in result:
            return flatten_ocr_result(result["res"])
        if "text" in result and "points" in result:
            norm_box = normalize_box(result.get("points"))
            if norm_box is not None:
                rows.append((norm_box, str(result.get("text") or ""), safe_float(result.get("score"), 0.0)))
            return rows
        texts = result.get("rec_texts") or result.get("texts") or []
        scores = result.get("rec_scores") or result.get("scores") or []
        boxes = result.get("rec_polys") or result.get("dt_polys") or result.get("boxes") or []
        for box, text, score in zip(boxes, texts, scores):
            norm_box = normalize_box(box)
            if norm_box is not None:
                rows.append((norm_box, str(text), safe_float(score, 0.0)))
    return rows


def build_frame_blocks(boxes: list[TextBox]) -> list[dict[str, Any]]:
    by_ts: dict[float, list[TextBox]] = {}
    for box in boxes:
        by_ts.setdefault(box.timestamp_sec, []).append(box)

    blocks: list[dict[str, Any]] = []
    seen_blocks: set[str] = set()
    for ts, frame_boxes in by_ts.items():
        sorted_boxes = sorted(frame_boxes, key=lambda b: (bbox(b.box)["cy"], bbox(b.box)["x"]))
        lines: list[list[TextBox]] = []
        for box in sorted_boxes:
            metrics = bbox(box.box)
            target = next((line for line in lines if same_line(bbox(line[-1].box), metrics)), None)
            if target is None:
                lines.append([box])
            else:
                target.append(box)

        merged_lines: list[dict[str, Any]] = []
        for line in lines:
            line = sorted(line, key=lambda b: bbox(b.box)["x"])
            merged_lines.append({
                "text": " ".join(part.text for part in line),
                "confidence": sum(part.confidence for part in line) / len(line),
                "box": union_boxes([part.box for part in line]),
                "timestampSec": ts,
                "frameWidth": line[0].frame_width,
                "frameHeight": line[0].frame_height,
            })

        for line in merged_lines:
            add_block(
                blocks,
                seen_blocks,
                line["text"],
                line["box"],
                line["timestampSec"],
                line["frameWidth"],
                line["frameHeight"],
                line["confidence"],
            )

        for group in group_nearby_lines(merged_lines):
            if len(group) <= 1:
                continue
            add_block(
                blocks,
                seen_blocks,
                "\n".join(item["text"] for item in group),
                union_boxes([item["box"] for item in group]),
                ts,
                group[0]["frameWidth"],
                group[0]["frameHeight"],
                sum(item["confidence"] for item in group) / len(group),
            )
    return blocks


def add_block(
    blocks: list[dict[str, Any]],
    seen_blocks: set[str],
    text: str,
    box: list[list[float]],
    timestamp_sec: float,
    frame_width: int,
    frame_height: int,
    confidence: float,
) -> None:
    normalized = normalize_text(text)
    if not normalized:
        return
    region = normalized_region(box, frame_width, frame_height)
    area = region["w"] * region["h"]
    if area < 0.00025 or region["h"] < 0.008:
        return
    key = f"{round(timestamp_sec, 2)}:{''.join(ch.lower() for ch in normalized if ch.isalnum())}:{round(region['x'], 2)}:{round(region['y'], 2)}"
    if key in seen_blocks:
        return
    seen_blocks.add(key)
    blocks.append({
        "detectedText": normalized,
        "region": region,
        "timestampSec": timestamp_sec,
        "confidence": round(confidence, 3),
    })


def group_nearby_lines(lines: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    for line in sorted(lines, key=lambda item: (bbox(item["box"])["y"], bbox(item["box"])["x"])):
        metrics = bbox(line["box"])
        target = None
        for group in groups:
            last = bbox(group[-1]["box"])
            vertical_gap = metrics["y"] - last["bottom"]
            x_overlap = overlap_ratio(metrics["x"], metrics["right"], last["x"], last["right"])
            if vertical_gap >= 0 and vertical_gap <= max(last["h"], metrics["h"]) * 0.95 and x_overlap >= 0.35:
                target = group
                break
        if target is None:
            groups.append([line])
        else:
            target.append(line)
    return groups


def group_tracks(
    blocks: list[dict[str, Any]],
    duration_sec: float,
    sample_interval_sec: float,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    tracks: list[list[dict[str, Any]]] = []
    split_count = 0
    max_gap_sec = max(0.25, sample_interval_sec * 6.0)
    for block in sorted(blocks, key=lambda b: (b["timestampSec"], b["region"]["y"])):
        target = next((track for track in tracks if should_join_track(track[-1], block, max_gap_sec)), None)
        if target is None:
            tracks.append([block])
        else:
            if track_drift_too_large(target, block):
                split_count += 1
                tracks.append([block])
                continue
            target.append(block)

    items: list[dict[str, Any]] = []
    max_duration = max(0.2, duration_sec or 0.2)
    half_interval = sample_interval_sec / 2.0
    for track in tracks:
        first_seen = min(item["timestampSec"] for item in track)
        last_seen = max(item["timestampSec"] for item in track)
        start = max(0.0, first_seen - half_interval)
        end = min(max_duration, last_seen + half_interval)
        text = best_text([item["detectedText"] for item in track])
        region = padded_track_region([item["region"] for item in track])
        confidence = sum(item["confidence"] for item in track) / len(track)
        items.append({
            "detectedText": text,
            "region": region,
            "timestampSec": round(first_seen, 2),
            "startSec": round(start, 2),
            "endSec": round(max(start + 0.3, end), 2),
            "firstSeenSec": round(first_seen, 2),
            "lastSeenSec": round(last_seen, 2),
            "confidence": round(confidence, 3),
            "detections": len(track),
            "sampleIntervalSec": round(sample_interval_sec, 3),
            "sampleCount": len(track),
            "maxGapSec": round(max_gap_sec, 3),
            "source": "paddleocr",
        })
    return (
        sorted(items, key=lambda item: (item["startSec"], item["region"]["y"])),
        {
            "track_count": len(tracks),
            "split_count": split_count,
        },
    )


def should_join_track(a: dict[str, Any], b: dict[str, Any], max_gap_sec: float) -> bool:
    if b["timestampSec"] - a["timestampSec"] > max_gap_sec:
        return False
    similar = text_similarity(a["detectedText"], b["detectedText"]) >= 0.72
    spatial = region_iou(a["region"], b["region"]) >= 0.12 or center_distance(a["region"], b["region"]) <= 0.18
    return similar and spatial


def is_output_item(item: dict[str, Any]) -> bool:
    text = item["detectedText"]
    region = item["region"]
    detections = int(item.get("detections") or 1)
    area = region["w"] * region["h"]
    normalized = "".join(ch.lower() for ch in text if ch.isalnum())
    if item["confidence"] < 0.35:
        return False
    if len(normalized) <= 2:
        return False
    if area < 0.0012 or region["h"] < 0.018:
        return False
    # Avoid one-frame hallucinations on faces/background texture. Very short
    # labels need repeat evidence or a large, high-confidence visible slot.
    if len(normalized) < 6 and detections < 2 and (item["confidence"] < 0.72 or area < 0.008):
        return False
    if detections < 2 and item["confidence"] < 0.58:
        return False
    return True


def normalize_box(raw: Any) -> list[list[float]] | None:
    try:
        points = [[float(p[0]), float(p[1])] for p in raw]
    except Exception:
        return None
    return points if len(points) >= 4 else None


def union_boxes(boxes: list[list[list[float]]]) -> list[list[float]]:
    xs = [p[0] for box in boxes for p in box]
    ys = [p[1] for box in boxes for p in box]
    return [[min(xs), min(ys)], [max(xs), min(ys)], [max(xs), max(ys)], [min(xs), max(ys)]]


def normalized_region(box: list[list[float]], frame_width: int, frame_height: int) -> dict[str, float]:
    metrics = bbox(box)
    fw = max(1, frame_width)
    fh = max(1, frame_height)
    x = clamp(metrics["x"] / fw, 0.0, 0.98)
    y = clamp(metrics["y"] / fh, 0.0, 0.98)
    return {
        "x": round(x, 4),
        "y": round(y, 4),
        "w": round(clamp(metrics["w"] / fw, 0.01, 1.0 - x), 4),
        "h": round(clamp(metrics["h"] / fh, 0.01, 1.0 - y), 4),
    }


def bbox(box: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    x = min(xs)
    y = min(ys)
    right = max(xs)
    bottom = max(ys)
    w = max(1.0, right - x)
    h = max(1.0, bottom - y)
    return {
        "x": x,
        "y": y,
        "right": right,
        "bottom": bottom,
        "w": w,
        "h": h,
        "cx": x + w / 2,
        "cy": y + h / 2,
    }


def normalize_text(text: str) -> str:
    lines = [" ".join(line.split()).strip() for line in str(text).replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line).strip()


def is_noise_text(text: str) -> bool:
    cleaned = text.strip().lower()
    if cleaned in {"like", "share", "follow", "subscribe"}:
        return True
    if cleaned.startswith("@") or cleaned.startswith("#"):
        return True
    if len(cleaned) <= 2 and not cleaned.isalpha():
        return True
    return False


def same_line(a: dict[str, float], b: dict[str, float]) -> bool:
    vertical_overlap = overlap_ratio(a["y"], a["bottom"], b["y"], b["bottom"])
    center_close = abs(a["cy"] - b["cy"]) <= max(a["h"], b["h"]) * 0.55
    gap = b["x"] - a["right"]
    return (vertical_overlap >= 0.45 or center_close) and gap <= max(a["h"], b["h"]) * 2.2


def overlap_ratio(a0: float, a1: float, b0: float, b1: float) -> float:
    overlap = max(0.0, min(a1, b1) - max(a0, b0))
    shorter = max(1.0, min(a1 - a0, b1 - b0))
    return overlap / shorter


def region_iou(a: dict[str, float], b: dict[str, float]) -> float:
    left = max(a["x"], b["x"])
    top = max(a["y"], b["y"])
    right = min(a["x"] + a["w"], b["x"] + b["w"])
    bottom = min(a["y"] + a["h"], b["y"] + b["h"])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    union = a["w"] * a["h"] + b["w"] * b["h"] - intersection
    return intersection / union if union > 0 else 0.0


def center_distance(a: dict[str, float], b: dict[str, float]) -> float:
    ax = a["x"] + a["w"] / 2
    ay = a["y"] + a["h"] / 2
    bx = b["x"] + b["w"] / 2
    by = b["y"] + b["h"] / 2
    return math.hypot(ax - bx, ay - by)


def track_drift_too_large(track: list[dict[str, Any]], candidate: dict[str, Any]) -> bool:
    union = padded_track_region([item["region"] for item in track])
    candidate_region = candidate["region"]
    candidate_area = max(0.0001, candidate_region["w"] * candidate_region["h"])
    union_area = max(0.0001, union["w"] * union["h"])
    if region_iou(union, candidate_region) >= 0.08:
        return False
    if center_distance(union, candidate_region) > 0.24:
        return True
    return union_area > candidate_area * 3.8


def padded_track_region(regions: list[dict[str, float]]) -> dict[str, float]:
    left = min(region["x"] for region in regions)
    top = min(region["y"] for region in regions)
    right = max(region["x"] + region["w"] for region in regions)
    bottom = max(region["y"] + region["h"] for region in regions)
    pad_x = max(0.008, (right - left) * 0.08)
    pad_y = max(0.008, (bottom - top) * 0.12)
    x = clamp(left - pad_x, 0.0, 0.98)
    y = clamp(top - pad_y, 0.0, 0.98)
    padded_right = clamp(right + pad_x, x + 0.01, 1.0)
    padded_bottom = clamp(bottom + pad_y, y + 0.01, 1.0)
    return {
        "x": round(x, 4),
        "y": round(y, 4),
        "w": round(clamp(padded_right - x, 0.01, 1.0 - x), 4),
        "h": round(clamp(padded_bottom - y, 0.01, 1.0 - y), 4),
    }


def most_common_text(values: list[str]) -> str:
    counts: dict[str, tuple[str, int]] = {}
    for value in values:
        key = "".join(ch.lower() for ch in value if ch.isalnum())
        previous = counts.get(key)
        counts[key] = (value, (previous[1] if previous else 0) + 1)
    return sorted(counts.values(), key=lambda item: item[1], reverse=True)[0][0]


def best_text(values: list[str]) -> str:
    candidates = [value for value in values if value and value.strip()]
    if not candidates:
        return ""
    return sorted(candidates, key=text_quality_score, reverse=True)[0]


def text_quality_score(value: str) -> float:
    normalized = "".join(ch.lower() for ch in value if ch.isalnum())
    words = [part for part in value.replace("\n", " ").split() if part]
    lines = [line for line in value.splitlines() if line.strip()]
    return len(normalized) * 1.2 + len(words) * 5 + len(lines) * 3


def text_similarity(a: str, b: str) -> float:
    left = "".join(ch.lower() for ch in a if ch.isalnum())
    right = "".join(ch.lower() for ch in b if ch.isalnum())
    if left == right:
        return 1.0
    if not left or not right:
        return 0.0
    if left in right or right in left:
        return 0.86
    return 1.0 - levenshtein(left, right) / max(len(left), len(right))


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        last = i - 1
        prev[0] = i
        for j, cb in enumerate(b, 1):
            tmp = prev[j]
            prev[j] = min(prev[j] + 1, prev[j - 1] + 1, last + (0 if ca == cb else 1))
            last = tmp
    return prev[-1]


def safe_float(value: Any, fallback: float) -> float:
    try:
        n = float(value)
        return n if math.isfinite(n) else fallback
    except Exception:
        return fallback


def is_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except Exception:
        return False


def clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def estimate_sample_interval(timestamps: list[float]) -> float:
    if len(timestamps) < 2:
        return 1.0 / 24.0
    diffs = [
        round(timestamps[idx + 1] - timestamps[idx], 4)
        for idx in range(len(timestamps) - 1)
        if timestamps[idx + 1] - timestamps[idx] > 0.0009
    ]
    if not diffs:
        return 1.0 / 24.0
    diffs.sort()
    return diffs[len(diffs) // 2]


def run_ocr(ocr: Any, image_path: str) -> Any:
    if hasattr(ocr, "predict"):
        result = ocr.predict(image_path)
        if isinstance(result, list) and len(result) == 1:
            return result[0]
        return result
    return ocr.ocr(image_path, cls=True)
