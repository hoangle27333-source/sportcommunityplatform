"use client";

import React, { useRef, useEffect } from 'react';

interface TrimSliderProps {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrimSlider({ duration, start, end, onChange }: TrimSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  const getTimeFromEvent = (e: MouseEvent | React.MouseEvent): number => {
    const track = trackRef.current;
    if (!track || !duration) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const t = getTimeFromEvent(e);
      if (dragging.current === 'start') {
        const newStart = Math.max(0, Math.min(t, end - 1));
        onChange(Math.floor(newStart), end);
      } else {
        const newEnd = Math.max(start + 1, Math.min(t, duration));
        onChange(start, Math.floor(newEnd));
      }
    };
    const onMouseUp = () => { dragging.current = null; };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [duration, start, end, onChange]);

  if (!duration) return <div className="h-12 w-full bg-muted animate-pulse rounded-md"></div>;

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs font-medium">
        <span>Bắt đầu: {formatTime(start)}</span>
        <span className="text-primary font-semibold">Đã chọn: {formatTime(end - start)}</span>
        <span>Kết thúc: {formatTime(end)} / {formatTime(duration)}</span>
      </div>
      
      <div className="relative py-2" ref={trackRef}>
        <div className="h-8 w-full bg-muted rounded-md overflow-hidden flex relative">
           <div className="absolute inset-0 opacity-20 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
        </div>
        
        {/* Selected Area */}
        <div 
          className="absolute top-2 bottom-2 bg-primary/60 border-y-2 border-primary"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />
        
        {/* Start Handle */}
        <div 
          className="absolute top-1 bottom-1 w-4 -ml-2 bg-white rounded-full shadow-md border border-gray-300 cursor-ew-resize flex items-center justify-center z-10 hover:bg-gray-50 hover:scale-110 transition-transform"
          style={{ left: `${startPercent}%` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = 'start'; }}
        >
          <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
        </div>
        
        {/* End Handle */}
        <div 
          className="absolute top-1 bottom-1 w-4 -ml-2 bg-white rounded-full shadow-md border border-gray-300 cursor-ew-resize flex items-center justify-center z-10 hover:bg-gray-50 hover:scale-110 transition-transform"
          style={{ left: `${endPercent}%` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = 'end'; }}
        >
          <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
        </div>
      </div>
    </div>
  );
}
