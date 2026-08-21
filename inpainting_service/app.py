from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse


app = FastAPI(title="Remix GPU Text Inpaint POC", version="0.1.0")
JOBS: dict[str, "InpaintJob"] = {}
JOB_LOCK = threading.Lock()


@dataclass
class Region:
    x: float
    y: float
    w: float
    h: float


@dataclass
class MaskFrame:
    timestamp_sec: float
    regions: list[Region]
    polygons: list[list[tuple[float, float]]]


@dataclass
class MaskTrack:
    id: str
    start_sec: float
    end_sec: float
    frames: list[MaskFrame]


@dataclass
class InpaintJob:
    id: str
    engine: str
    work_dir: Path
    status: str = "queued"
    error: str | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "gpu-text-inpaint-poc",
        "configuredEngines": configured_engines(),
    }


@app.post("/jobs")
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tracksJson: str = Form(...),
    engine: str = Form(...),
):
    if engine not in {"propainter", "e2fgvi_hq"}:
        raise HTTPException(status_code=400, detail="engine must be propainter or e2fgvi_hq")
    tracks = parse_tracks(tracksJson)
    if not tracks:
        raise HTTPException(status_code=400, detail="tracksJson has no valid mask tracks")
    work_dir = Path(tempfile.mkdtemp(prefix="remix-gpu-inpaint-"))
    job = InpaintJob(id=uuid.uuid4().hex, engine=engine, work_dir=work_dir)
    input_path = work_dir / "input.mp4"
    with input_path.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    with JOB_LOCK:
        JOBS[job.id] = job
    background_tasks.add_task(run_job, job, input_path, tracks)
    return {"id": job.id, "status": job.status}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = get_existing_job(job_id)
    response: dict[str, Any] = {
        "id": job.id,
        "status": job.status,
        "diagnostics": job.diagnostics,
    }
    if job.status == "completed":
        response["resultUrl"] = f"/jobs/{job.id}/result"
    if job.error:
        response["error"] = job.error
    return response


@app.get("/jobs/{job_id}/result")
def get_result(job_id: str, background_tasks: BackgroundTasks):
    job = get_existing_job(job_id)
    output = job.work_dir / "output.mp4"
    if job.status != "completed" or not output.exists():
        raise HTTPException(status_code=409, detail="inpaint result is not ready")
    background_tasks.add_task(cleanup_job, job.id, delay_sec=600)
    return FileResponse(output, media_type="video/mp4", filename="source-text-removed.mp4")


def run_job(job: InpaintJob, input_path: Path, tracks: list[MaskTrack]) -> None:
    started = time.monotonic()
    job.status = "processing"
    try:
        masks_dir = job.work_dir / "masks"
        mask_info = render_masks(input_path, masks_dir, tracks)
        output_path = job.work_dir / "output.mp4"
        command = command_for_engine(job.engine, input_path, masks_dir, output_path)
        if command is None:
            raise RuntimeError(
                f"{job.engine} is not configured. Mount the model repository and set "
                f"TEXT_INPAINT_COMMAND_{job.engine.upper()} with {{input}}, {{masks}}, and {{output}} placeholders."
            )
        subprocess.run(command, check=True, cwd=job.work_dir, capture_output=True, text=True, timeout=3600)
        if not output_path.exists() or output_path.stat().st_size < 1024:
            raise RuntimeError(f"{job.engine} did not produce output.mp4")
        job.diagnostics = {
            "engine": job.engine,
            **mask_info,
            "durationMs": round((time.monotonic() - started) * 1000),
        }
        job.status = "completed"
    except Exception as exc:
        job.error = str(exc)[-1200:]
        job.diagnostics = {
            "engine": job.engine,
            "durationMs": round((time.monotonic() - started) * 1000),
            "fallbackReason": job.error,
        }
        job.status = "failed"


def render_masks(input_path: Path, masks_dir: Path, tracks: list[MaskTrack]) -> dict[str, Any]:
    import cv2
    import numpy as np

    masks_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RuntimeError("Could not open input video for mask rendering")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    index = 0
    mask_frames = 0
    covered_pixels = 0
    total_pixels = 0
    max_gap = float(os.getenv("TEXT_INPAINT_MASK_MAX_GAP_SEC", "0.75"))
    try:
        while True:
            ok, _ = capture.read()
            if not ok:
                break
            timestamp = index / fps
            mask = np.zeros((height, width), dtype=np.uint8)
            for track in tracks:
                if timestamp < track.start_sec or timestamp > track.end_sec:
                    continue
                sample = closest_sample(track.frames, timestamp, max_gap)
                if sample:
                    draw_sample_mask(mask, sample, width, height, cv2)
            # Video inpainting engines require a mask file for every source
            # frame, including frames where none of the OCR tracks is active.
            cv2.imwrite(str(masks_dir / f"{index:08d}.png"), mask)
            if mask.any():
                mask_frames += 1
                covered_pixels += int(np.count_nonzero(mask))
            total_pixels += width * height
            index += 1
    finally:
        capture.release()
    return {
        "sourceMaskFrameCount": sum(len(track.frames) for track in tracks),
        "renderedMaskFrameCount": mask_frames,
        "coverageRatio": round(covered_pixels / max(1, total_pixels), 6),
    }


def draw_sample_mask(mask: Any, sample: MaskFrame, width: int, height: int, cv2: Any) -> None:
    import numpy as np

    dilation_px = max(2, int(os.getenv("TEXT_INPAINT_MASK_DILATE_PX", "7")))
    for polygon in sample.polygons:
        points = np.array([[(round(x * width), round(y * height)) for x, y in polygon]], dtype=np.int32)
        cv2.fillPoly(mask, points, 255)
    for region in sample.regions:
        x = max(0, round(region.x * width))
        y = max(0, round(region.y * height))
        right = min(width, round((region.x + region.w) * width))
        bottom = min(height, round((region.y + region.h) * height))
        cv2.rectangle(mask, (x, y), (right, bottom), 255, thickness=-1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilation_px * 2 + 1, dilation_px * 2 + 1))
    mask[:] = cv2.dilate(mask, kernel, iterations=1)


def closest_sample(samples: list[MaskFrame], timestamp: float, max_gap: float) -> MaskFrame | None:
    if not samples:
        return None
    sample = min(samples, key=lambda item: abs(item.timestamp_sec - timestamp))
    return sample if abs(sample.timestamp_sec - timestamp) <= max_gap else None


def command_for_engine(engine: str, input_path: Path, masks_dir: Path, output_path: Path) -> list[str] | None:
    import shlex

    key = f"TEXT_INPAINT_COMMAND_{engine.upper()}"
    template = os.getenv(key, "").strip()
    if not template:
        return None
    return [
        part.format(input=str(input_path), masks=str(masks_dir), output=str(output_path))
        for part in shlex.split(template)
    ]


def parse_tracks(raw: str) -> list[MaskTrack]:
    try:
        values = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="tracksJson must be valid JSON") from exc
    if not isinstance(values, list):
        raise HTTPException(status_code=400, detail="tracksJson must be an array")
    tracks: list[MaskTrack] = []
    for index, value in enumerate(values[:96]):
        if not isinstance(value, dict):
            continue
        frames = [parse_mask_frame(item) for item in value.get("frames", []) if isinstance(item, dict)]
        frames = [item for item in frames if item is not None]
        if not frames:
            continue
        start = max(0.0, number(value.get("startSec"), frames[0].timestamp_sec))
        end = max(start + 0.05, number(value.get("endSec"), frames[-1].timestamp_sec + 0.05))
        tracks.append(MaskTrack(str(value.get("id") or f"track-{index}"), start, end, frames))
    return tracks


def parse_mask_frame(value: dict[str, Any]) -> MaskFrame | None:
    timestamp = number(value.get("timestampSec"), -1)
    if timestamp < 0:
        return None
    regions = [parse_region(item) for item in value.get("regions", []) if isinstance(item, dict)]
    polygons = [parse_polygon(item) for item in value.get("polygons", []) if isinstance(item, list)]
    valid_regions = [item for item in regions if item is not None]
    valid_polygons = [item for item in polygons if item is not None]
    return MaskFrame(timestamp, valid_regions, valid_polygons) if valid_regions or valid_polygons else None


def parse_region(value: dict[str, Any]) -> Region | None:
    x, y, w, h = (number(value.get(key), -1 if key in {"x", "y"} else 0) for key in ("x", "y", "w", "h"))
    if x < 0 or y < 0 or w <= 0 or h <= 0:
        return None
    return Region(min(0.99, x), min(0.99, y), min(1 - x, w), min(1 - y, h))


def parse_polygon(value: list[Any]) -> list[tuple[float, float]] | None:
    points = []
    for item in value:
        if not isinstance(item, dict):
            continue
        x, y = number(item.get("x"), -1), number(item.get("y"), -1)
        if x >= 0 and y >= 0:
            points.append((min(1.0, x), min(1.0, y)))
    return points if len(points) >= 3 else None


def number(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def get_existing_job(job_id: str) -> InpaintJob:
    with JOB_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown inpaint job")
    return job


def cleanup_job(job_id: str, delay_sec: int) -> None:
    time.sleep(delay_sec)
    with JOB_LOCK:
        job = JOBS.pop(job_id, None)
    if job:
        shutil.rmtree(job.work_dir, ignore_errors=True)


def configured_engines() -> list[str]:
    return [engine for engine in ("propainter", "e2fgvi_hq") if os.getenv(f"TEXT_INPAINT_COMMAND_{engine.upper()}", "").strip()]
