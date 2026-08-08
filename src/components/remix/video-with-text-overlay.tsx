"use client";

import * as React from "react";

export interface OverlayTextTrack {
  id?: string;
  kind?: string;
  reason?: string;
  startSec?: number;
  endSec?: number;
  sourceText?: string;
  translatedText?: string;
  region?: { x: number; y: number; w: number; h: number };
  confidence?: number;
}

export interface VideoWithTextOverlayProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src?: string;
  overlays?: OverlayTextTrack[];
  enabled?: boolean;
  styleProps?: {
    font?: string;
    size?: number | string;
    color?: string;
    bgColor?: string;
    outlineColor?: string;
    bold?: boolean;
  };
}

interface VideoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getRenderedVideoRect(video: HTMLVideoElement | null): VideoRect {
  if (!video) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const { clientWidth: cw, clientHeight: ch, videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh || !cw || !ch) {
    return { left: 0, top: 0, width: cw || 0, height: ch || 0 };
  }
  const videoRatio = vw / vh;
  const containerRatio = cw / ch;
  let width = cw;
  let height = ch;
  let left = 0;
  let top = 0;

  if (videoRatio > containerRatio) {
    height = cw / videoRatio;
    top = (ch - height) / 2;
  } else {
    width = ch * videoRatio;
    left = (cw - width) / 2;
  }

  return { left, top, width, height };
}

export const VideoWithTextOverlay = React.forwardRef<
  HTMLVideoElement,
  VideoWithTextOverlayProps
>(
  (
    {
      src,
      overlays = [],
      enabled = true,
      styleProps = {},
      className = "",
      ...videoProps
    },
    forwardedRef
  ) => {
    const internalRef = React.useRef<HTMLVideoElement | null>(null);
    const [activeTracks, setActiveTracks] = React.useState<OverlayTextTrack[]>([]);
    const [videoRect, setVideoRect] = React.useState<VideoRect>({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });

    const setRefs = React.useCallback(
      (node: HTMLVideoElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    const updateVideoRect = React.useCallback(() => {
      if (internalRef.current) {
        setVideoRect(getRenderedVideoRect(internalRef.current));
      }
    }, []);

    React.useEffect(() => {
      const video = internalRef.current;
      if (!video) return;

      updateVideoRect();

      const observer = new ResizeObserver(() => {
        updateVideoRect();
      });
      observer.observe(video);

      window.addEventListener("resize", updateVideoRect);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updateVideoRect);
      };
    }, [updateVideoRect]);

    // Scan currentTime every 0.01s (10ms interval) for active text overlays
    React.useEffect(() => {
      if (!enabled || !overlays.length) {
        setActiveTracks([]);
        return;
      }

      const interval = setInterval(() => {
        const video = internalRef.current;
        if (!video) return;

        const t = video.currentTime;
        // Filter tracks where startSec <= currentTime <= endSec
        const matching = overlays
          .filter((track) => {
            if (track.kind && track.kind !== "text") return false;
            const text = track.translatedText || track.sourceText || "";
            if (!text.trim()) return false;
            const start = typeof track.startSec === "number" ? track.startSec : 0;
            const end = typeof track.endSec === "number" ? track.endSec : 0;
            return end > start && t >= start && t <= end;
          })
          .sort((a, b) => (a.region?.y ?? 0) - (b.region?.y ?? 0));

        setActiveTracks((prev) => {
          if (
            prev.length === matching.length &&
            prev.every(
              (item, idx) =>
                item.translatedText === matching[idx].translatedText &&
                item.sourceText === matching[idx].sourceText &&
                item.startSec === matching[idx].startSec &&
                item.endSec === matching[idx].endSec
            )
          ) {
            return prev;
          }
          return matching;
        });
      }, 10); // 0.01s = 10ms scan interval

      return () => clearInterval(interval);
    }, [enabled, overlays]);

    return (
      <div className="relative inline-block w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={setRefs}
          src={src}
          className={`w-full ${className}`}
          onLoadedMetadata={(e) => {
            updateVideoRect();
            if (videoProps.onLoadedMetadata) {
              videoProps.onLoadedMetadata(e);
            }
          }}
          {...videoProps}
        />
        {enabled && activeTracks.length > 0 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {activeTracks.map((track, idx) => {
              const text = track.translatedText || track.sourceText || "";
              const region = track.region || { x: 0.05, y: 0.75, w: 0.9, h: 0.15 };
              const left = videoRect.left + region.x * videoRect.width;
              const top = videoRect.top + region.y * videoRect.height;
              const width = region.w * videoRect.width;
              const height = region.h * videoRect.height;

              const baseSize = Number(styleProps?.size) || 34;
              const scale = videoRect.width > 0 ? videoRect.width / 480 : 1;
              const fontSizePx = Math.max(
                12,
                Math.min(44, Math.round(baseSize * scale))
              );

              return (
                <div
                  key={`${track.id || idx}-${track.startSec}`}
                  style={{
                    position: "absolute",
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    minHeight: `${height}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2px 6px",
                    zIndex: 20,
                  }}
                >
                  <span
                    className="inline-block text-center rounded px-2.5 py-1 leading-tight shadow-lg transition-all duration-75"
                    style={{
                      fontFamily: styleProps?.font || "Anton, Impact, sans-serif",
                      fontSize: `${fontSizePx}px`,
                      color: styleProps?.color || "#FFFFFF",
                      backgroundColor: styleProps?.bgColor || "rgba(0, 0, 0, 0.88)",
                      WebkitTextStroke: `1px ${styleProps?.outlineColor || "#000000"}`,
                      fontWeight: styleProps?.bold !== false ? 800 : 500,
                      wordBreak: "break-word",
                    }}
                  >
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

VideoWithTextOverlay.displayName = "VideoWithTextOverlay";
