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
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask


app = FastAPI(title="Remix OCR Service", version="1.0.0")


@dataclass
class TextBox:
    text: str
    confidence: float
    box: list[list[float]]
    timestamp_sec: float
    frame_width: int
    frame_height: int


@dataclass
class InpaintRegion:
    x: float
    y: float
    w: float
    h: float
    start_sec: float
    end_sec: float


@dataclass
class InpaintMaskFrame:
    timestamp_sec: float
    regions: list[InpaintRegion]
    polygons: list[list[list[float]]]


@dataclass
class InpaintTrack:
    track_id: str
    start_sec: float
    end_sec: float
    frames: list[InpaintMaskFrame]


@lru_cache(maxsize=8)
def get_ocr(lang: str):
    from paddleocr import PaddleOCR

    language = lang or "en"
    detection_model = os.getenv("PADDLEOCR_DETECTION_MODEL") or "PP-OCRv5_mobile_det"
    default_recognition_model = "en_PP-OCRv5_mobile_rec" if language == "en" else "PP-OCRv5_mobile_rec"
    recognition_model = os.getenv("PADDLEOCR_RECOGNITION_MODEL") or default_recognition_model
    try:
        return PaddleOCR(
            lang=language,
            text_detection_model_name=detection_model,
            text_recognition_model_name=recognition_model,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    except Exception:
        return PaddleOCR(lang=language)


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr"}


@app.post("/detect-video-text")
async def detect_video_text(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    durationSec: Optional[float] = Form(default=None),
    sampleTimestamps: Optional[str] = Form(default=None),
    lang: Optional[str] = Form(default=None),
    frameWidthLimit: Optional[int] = Form(default=None),
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


@app.post("/inpaint-video-text")
async def inpaint_video_text(
    file: UploadFile = File(...),
    regionsJson: Optional[str] = Form(default=None),
    tracksJson: Optional[str] = Form(default=None),
    method: str = Form(default="adaptive"),
):
    """Remove burned-in text using one polygon-aware mask and inpaint pass per frame."""
    work_dir = Path(tempfile.mkdtemp(prefix="remix-inpaint-"))
    try:
        suffix = Path(file.filename or "input.mp4").suffix or ".mp4"
        input_path = work_dir / f"input{suffix}"
        with input_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        tracks = parse_inpaint_tracks(tracksJson)
        regions = parse_inpaint_regions(regionsJson) if regionsJson else []
        if not tracks and not regions:
            raise HTTPException(status_code=400, detail="No valid inpaint mask tracks or regions")
        silent_path = work_dir / "inpainted-silent.mp4"
        output_path = work_dir / "inpainted.mp4"
        diagnostics = inpaint_video(input_path, silent_path, tracks, regions, method, work_dir)
        mux_original_audio(silent_path, input_path, output_path)
        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="inpainted.mp4",
            headers={"X-Text-Inpaint-Diagnostics": json.dumps(diagnostics, separators=(",", ":"))},
            background=BackgroundTask(shutil.rmtree, work_dir, True),
        )
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def resolve_video_path(file: Optional[UploadFile], payload: dict[str, Any], work_dir: Path) -> Path:
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


def parse_inpaint_regions(raw: str) -> list[InpaintRegion]:
    try:
        items = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="regionsJson must be valid JSON") from exc
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="regionsJson must be an array")
    regions: list[InpaintRegion] = []
    for item in items[:128]:
        if not isinstance(item, dict):
            continue
        x = safe_float(item.get("x"), -1)
        y = safe_float(item.get("y"), -1)
        w = safe_float(item.get("w"), 0)
        h = safe_float(item.get("h"), 0)
        if x < 0 or y < 0 or w <= 0 or h <= 0:
            continue
        start = max(0.0, safe_float(item.get("startSec"), 0))
        end = max(start + 0.05, safe_float(item.get("endSec"), start + 0.05))
        regions.append(InpaintRegion(
            x=clamp(x, 0.0, 0.99),
            y=clamp(y, 0.0, 0.99),
            w=clamp(w, 0.002, 1.0 - clamp(x, 0.0, 0.99)),
            h=clamp(h, 0.002, 1.0 - clamp(y, 0.0, 0.99)),
            start_sec=start,
            end_sec=end,
        ))
    return regions


def parse_inpaint_tracks(raw: Optional[str]) -> list[InpaintTrack]:
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="tracksJson must be valid JSON") from exc
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="tracksJson must be an array")

    tracks: list[InpaintTrack] = []
    for index, item in enumerate(items[:96]):
        if not isinstance(item, dict):
            continue
        start = max(0.0, safe_float(item.get("startSec"), 0))
        end = max(start + 0.05, safe_float(item.get("endSec"), start + 0.05))
        raw_frames = item.get("frames")
        if not isinstance(raw_frames, list):
            continue
        frames: list[InpaintMaskFrame] = []
        for raw_frame in raw_frames[:512]:
            if not isinstance(raw_frame, dict):
                continue
            timestamp = safe_float(raw_frame.get("timestampSec"), -1)
            if timestamp < 0:
                continue
            regions = parse_inpaint_region_items(raw_frame.get("regions"), start, end)
            polygons = parse_mask_polygons(raw_frame.get("polygons"))
            if not regions and not polygons:
                continue
            frames.append(InpaintMaskFrame(timestamp_sec=timestamp, regions=regions, polygons=polygons))
        if frames:
            tracks.append(InpaintTrack(
                track_id=str(item.get("id") or f"track-{index}"),
                start_sec=start,
                end_sec=end,
                frames=sorted(frames, key=lambda frame: frame.timestamp_sec),
            ))
    return dedupe_inpaint_tracks(tracks)


def parse_inpaint_region_items(raw: Any, start_sec: float, end_sec: float) -> list[InpaintRegion]:
    if not isinstance(raw, list):
        return []
    regions: list[InpaintRegion] = []
    for item in raw[:96]:
        if not isinstance(item, dict):
            continue
        x = safe_float(item.get("x"), -1)
        y = safe_float(item.get("y"), -1)
        w = safe_float(item.get("w"), 0)
        h = safe_float(item.get("h"), 0)
        if x < 0 or y < 0 or w <= 0 or h <= 0:
            continue
        regions.append(InpaintRegion(
            x=clamp(x, 0.0, 0.99),
            y=clamp(y, 0.0, 0.99),
            w=clamp(w, 0.002, 1.0 - clamp(x, 0.0, 0.99)),
            h=clamp(h, 0.002, 1.0 - clamp(y, 0.0, 0.99)),
            start_sec=start_sec,
            end_sec=end_sec,
        ))
    return regions


def parse_mask_polygons(raw: Any) -> list[list[list[float]]]:
    if not isinstance(raw, list):
        return []
    polygons: list[list[list[float]]] = []
    for polygon in raw[:96]:
        if not isinstance(polygon, list):
            continue
        points: list[list[float]] = []
        for point in polygon[:32]:
            if not isinstance(point, dict):
                continue
            x = safe_float(point.get("x"), -1)
            y = safe_float(point.get("y"), -1)
            if x < 0 or y < 0:
                continue
            points.append([clamp(x, 0.0, 1.0), clamp(y, 0.0, 1.0)])
        if len(points) >= 3:
            polygons.append(points)
    return polygons


def dedupe_inpaint_tracks(tracks: list[InpaintTrack]) -> list[InpaintTrack]:
    deduped: list[InpaintTrack] = []
    for track in tracks:
        duplicate = next((other for other in deduped if
            abs(other.start_sec - track.start_sec) < 0.05 and
            abs(other.end_sec - track.end_sec) < 0.05 and
            other.track_id == track.track_id
        ), None)
        if duplicate is None:
            deduped.append(track)
    return deduped


def inpaint_video(
    input_path: Path,
    output_path: Path,
    tracks: list[InpaintTrack],
    regions: list[InpaintRegion],
    method: str,
    work_dir: Path,
) -> dict[str, Any]:
    import cv2
    import numpy as np

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RuntimeError("Could not open input video for inpainting")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width <= 0 or height <= 0:
        capture.release()
        raise RuntimeError("Input video has invalid dimensions")
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("Could not create inpainted video")
    frame_index = 0
    inpainted_frames = 0
    telea_frames = 0
    ns_frames = 0
    covered_pixels = 0
    debug_frames = 0
    polygon_count = sum(len(frame.polygons) for track in tracks for frame in track.frames)
    debug_dir = work_dir / "debug"
    debug_dir.mkdir(exist_ok=True)
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            timestamp = frame_index / fps
            mask = np.zeros((height, width), dtype=np.uint8)
            for track in tracks:
                frame_mask = resolve_track_mask(track, timestamp, width, height, cv2, np)
                if frame_mask is not None:
                    mask = cv2.bitwise_or(mask, frame_mask)
            for region in regions:
                if timestamp < region.start_sec or timestamp > region.end_sec:
                    continue
                draw_legacy_inpaint_mask(mask, region, width, height, cv2)
            if mask.any():
                selected_method = select_inpaint_method(frame, mask, method, cv2)
                original_frame = frame.copy()
                frame = cv2.inpaint(frame, mask, 3, selected_method)
                inpainted_frames += 1
                covered_pixels += int(np.count_nonzero(mask))
                if selected_method == cv2.INPAINT_NS:
                    ns_frames += 1
                else:
                    telea_frames += 1
                if debug_frames < 3:
                    write_debug_frame(debug_dir, debug_frames, original_frame, frame, mask, cv2)
                    debug_frames += 1
            writer.write(frame)
            frame_index += 1
    finally:
        capture.release()
        writer.release()
    total_pixels = max(1, frame_index * width * height)
    return {
        "trackCount": len(tracks),
        "polygonCount": polygon_count,
        "renderedMaskFrameCount": inpainted_frames,
        "maskCoverageRatio": round(covered_pixels / total_pixels, 6),
        "teleaFrameCount": telea_frames,
        "navierStokesFrameCount": ns_frames,
        "debugFrameCount": debug_frames,
    }


def draw_legacy_inpaint_mask(mask: Any, region: InpaintRegion, frame_width: int, frame_height: int, cv2: Any) -> None:
    """Dilate the OCR box enough for outlines/shadows, but retain line shape."""
    x = max(0, int(math.floor(region.x * frame_width)))
    y = max(0, int(math.floor(region.y * frame_height)))
    right = min(frame_width, int(math.ceil((region.x + region.w) * frame_width)))
    bottom = min(frame_height, int(math.ceil((region.y + region.h) * frame_height)))
    box_height = max(1, bottom - y)
    pad_x = max(3, int(round(box_height * 0.22)))
    pad_y = max(4, int(round(box_height * 0.42)))
    x = max(0, x - pad_x)
    y = max(0, y - pad_y)
    right = min(frame_width, right + pad_x)
    bottom = min(frame_height, bottom + pad_y)
    cv2.rectangle(mask, (x, y), (right, bottom), 255, thickness=-1)


def resolve_track_mask(
    track: InpaintTrack,
    timestamp: float,
    frame_width: int,
    frame_height: int,
    cv2: Any,
    np: Any,
) -> Optional[Any]:
    """Rasterize a track at a video frame using an interpolated OCR sample.

    OCR polygons describe source glyph geometry. We never derive this mask from
    translated text, and every track contributes once to the composed mask.
    """
    if timestamp < track.start_sec or timestamp > track.end_sec:
        return None
    frame = interpolate_track_frame(track, timestamp)
    if frame is None:
        return None
    layer = np.zeros((frame_height, frame_width), dtype=np.uint8)
    for polygon in frame.polygons:
        points = np.array([
            [int(round(point[0] * frame_width)), int(round(point[1] * frame_height))]
            for point in polygon
        ], dtype=np.int32)
        if len(points) >= 3:
            cv2.fillPoly(layer, [points], 255)
    # Regions are a compatibility fallback for OCR results without polygons.
    # Filling both turns a precise glyph mask back into a broad rectangle.
    if not layer.any():
        for region in frame.regions:
            x = max(0, int(math.floor(region.x * frame_width)))
            y = max(0, int(math.floor(region.y * frame_height)))
            right = min(frame_width, int(math.ceil((region.x + region.w) * frame_width)))
            bottom = min(frame_height, int(math.ceil((region.y + region.h) * frame_height)))
            cv2.rectangle(layer, (x, y), (right, bottom), 255, thickness=-1)
    if not layer.any():
        return None
    return dilate_text_mask(layer, frame, frame_width, frame_height, cv2)


def interpolate_track_frame(track: InpaintTrack, timestamp: float) -> Optional[InpaintMaskFrame]:
    frames = track.frames
    if not frames:
        return None
    before = next((frame for frame in reversed(frames) if frame.timestamp_sec <= timestamp), None)
    after = next((frame for frame in frames if frame.timestamp_sec >= timestamp), None)
    if before is None:
        return after
    if after is None or after.timestamp_sec == before.timestamp_sec:
        return before
    ratio = clamp((timestamp - before.timestamp_sec) / (after.timestamp_sec - before.timestamp_sec), 0.0, 1.0)
    return InpaintMaskFrame(
        timestamp_sec=timestamp,
        regions=interpolate_regions(before.regions, after.regions, ratio),
        polygons=interpolate_polygons(before.polygons, after.polygons, ratio),
    )


def interpolate_regions(a: list[InpaintRegion], b: list[InpaintRegion], ratio: float) -> list[InpaintRegion]:
    if len(a) != len(b):
        return a if ratio < 0.5 else b
    regions: list[InpaintRegion] = []
    for left, right in zip(a, b):
        regions.append(InpaintRegion(
            x=left.x + (right.x - left.x) * ratio,
            y=left.y + (right.y - left.y) * ratio,
            w=left.w + (right.w - left.w) * ratio,
            h=left.h + (right.h - left.h) * ratio,
            start_sec=left.start_sec,
            end_sec=left.end_sec,
        ))
    return regions


def interpolate_polygons(
    a: list[list[list[float]]],
    b: list[list[list[float]]],
    ratio: float,
) -> list[list[list[float]]]:
    if len(a) != len(b) or any(len(left) != len(right) for left, right in zip(a, b)):
        return a if ratio < 0.5 else b
    return [
        [[left[0] + (right[0] - left[0]) * ratio, left[1] + (right[1] - left[1]) * ratio]
         for left, right in zip(left_polygon, right_polygon)]
        for left_polygon, right_polygon in zip(a, b)
    ]


def dilate_text_mask(
    mask: Any,
    frame: InpaintMaskFrame,
    frame_width: int,
    frame_height: int,
    cv2: Any,
) -> Any:
    line_heights = [region.h * frame_height for region in frame.regions]
    if not line_heights:
        for polygon in frame.polygons:
            ys = [point[1] * frame_height for point in polygon]
            if ys:
                line_heights.append(max(1.0, max(ys) - min(ys)))
    line_height = max(1.0, sum(line_heights) / max(1, len(line_heights)))
    # Captures outlined / shadowed glyph pixels without turning a text line into
    # the old broad rectangular cover. Vertical padding is intentionally larger.
    pad_x = max(2, min(18, int(round(line_height * 0.16))))
    pad_y = max(3, min(24, int(round(line_height * 0.32))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pad_x * 2 + 1, pad_y * 2 + 1))
    return cv2.dilate(mask, kernel, iterations=1)


def select_inpaint_method(frame: Any, mask: Any, requested: str, cv2: Any) -> int:
    if requested.lower() == "ns":
        return cv2.INPAINT_NS
    if requested.lower() == "telea":
        return cv2.INPAINT_TELEA
    # Smooth backgrounds tend to preserve gentle gradients better with NS. Text
    # over textured video defaults to Telea, which is more stable for small masks.
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    expanded = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17)))
    ring = cv2.subtract(expanded, mask)
    samples = gray[ring > 0]
    if len(samples) < 64:
        return cv2.INPAINT_TELEA
    edges = cv2.Canny(gray, 64, 128)
    edge_density = float((edges[ring > 0] > 0).mean())
    variance = float(samples.var())
    return cv2.INPAINT_NS if variance < 340.0 and edge_density < 0.06 else cv2.INPAINT_TELEA


def write_debug_frame(debug_dir: Path, index: int, original: Any, cleaned: Any, mask: Any, cv2: Any) -> None:
    mask_bgr = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    preview = cv2.hconcat([original, mask_bgr, cleaned])
    cv2.imwrite(str(debug_dir / f"mask-preview-{index:02d}.jpg"), preview)


def mux_original_audio(silent_path: Path, original_path: Path, output_path: Path) -> None:
    cmd = [
        ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(silent_path), "-i", str(original_path),
        "-map", "0:v:0", "-map", "1:a?",
        "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-c:a", "copy", "-shortest", str(output_path),
    ]
    subprocess.run(cmd, check=True)


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
        ffmpeg_bin(),
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


def ffmpeg_bin() -> str:
    configured = os.getenv("FFMPEG_PATH")
    if configured:
        return configured
    bundled = Path(__file__).resolve().parents[1] / "node_modules" / "ffmpeg-static" / "ffmpeg"
    if bundled.is_file():
        return str(bundled)
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    raise RuntimeError("FFmpeg binary not found. Set FFMPEG_PATH or install ffmpeg-static.")


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
                # Preserve PaddleOCR's individual source polygons for masks.
                # The union box remains useful for editor layout only.
                "maskPolygons": [part.box for part in line],
                "timestampSec": ts,
                "frameWidth": line[0].frame_width,
                "frameHeight": line[0].frame_height,
            })

        nearby_groups = group_nearby_lines(merged_lines)
        grouped_line_ids = {
            id(line)
            for group in nearby_groups
            if len(group) > 1
            for line in group
        }

        # Emit either the complete multiline caption or a standalone line,
        # never both. Emitting both creates duplicate OCR tracks and causes the
        # same source text area to be removed/rendered more than once.
        for line in merged_lines:
            if id(line) in grouped_line_ids:
                continue
            add_block(
                blocks,
                seen_blocks,
                line["text"],
                line["box"],
                line["timestampSec"],
                line["frameWidth"],
                line["frameHeight"],
                line["confidence"],
                [line["box"]],
                line["maskPolygons"],
            )

        for group in nearby_groups:
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
                [item["box"] for item in group],
                [polygon for item in group for polygon in item["maskPolygons"]],
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
    line_boxes: Optional[list[list[list[float]]]] = None,
    mask_polygons: Optional[list[list[list[float]]]] = None,
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
        "textRegions": [normalized_region(item, frame_width, frame_height) for item in (line_boxes or [box])],
        "maskPolygons": [normalized_polygon(item, frame_width, frame_height) for item in (mask_polygons or line_boxes or [box])],
        "timestampSec": timestamp_sec,
        "confidence": round(confidence, 3),
    })


def group_nearby_lines(lines: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    for line in sorted(lines, key=lambda item: (bbox(item["box"])["y"], bbox(item["box"])["x"])):
        metrics = bbox(line["box"])
        alnum_length = len("".join(ch for ch in line["text"] if ch.isalnum()))
        if alnum_length < 2:
            groups.append([line])
            continue
        target = None
        for group in groups:
            last = bbox(group[-1]["box"])
            vertical_gap = metrics["y"] - last["bottom"]
            x_overlap = overlap_ratio(metrics["x"], metrics["right"], last["x"], last["right"])
            max_height = max(last["h"], metrics["h"])
            # Outlined/shadowed subtitle boxes often overlap vertically by a
            # few pixels. Treat that as the same multiline caption instead of
            # rejecting the neighboring line and producing fragmented tracks.
            if (
                vertical_gap >= -max_height * 0.35
                and vertical_gap <= max_height * 0.75
                and x_overlap >= 0.30
            ):
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
        representative = max(
            track,
            key=lambda item: text_quality_score(item["detectedText"]) + item["confidence"] * 10,
        )
        region = padded_track_region([item["region"] for item in track])
        confidence = sum(item["confidence"] for item in track) / len(track)
        items.append({
            "detectedText": text,
            "region": region,
            "textRegions": representative.get("textRegions") or [representative["region"]],
            "lineRegions": representative.get("textRegions") or [representative["region"]],
            "maskFrames": [
                {
                    "timestampSec": round(item["timestampSec"], 3),
                    "regions": item.get("textRegions") or [item["region"]],
                    "polygons": item.get("maskPolygons") or [],
                }
                for item in track
            ],
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


def normalize_box(raw: Any) -> Optional[list[list[float]]]:
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


def normalized_polygon(box: list[list[float]], frame_width: int, frame_height: int) -> list[dict[str, float]]:
    fw = max(1, frame_width)
    fh = max(1, frame_height)
    return [
        {"x": round(clamp(point[0] / fw, 0.0, 1.0), 5), "y": round(clamp(point[1] / fh, 0.0, 1.0), 5)}
        for point in box
    ]


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
    alnum = "".join(ch for ch in cleaned if ch.isalnum())
    if len(alnum) <= 1:
        return True
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
