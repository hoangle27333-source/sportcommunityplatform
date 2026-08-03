"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrimSlider } from "@/components/remix/trim-slider";
import { RatioPicker } from "@/components/remix/ratio-picker";

interface VideoEditorProps {
  source: string;
  initialOptions?: Record<string, any>;
  onSave: (options: Record<string, any>) => void;
  onCancel: () => void;
}

export function VideoEditor({ source, initialOptions = {}, onSave, onCancel }: VideoEditorProps) {
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(initialOptions.trimStart || 0);
  const [trimEnd, setTrimEnd] = useState<number>(
    (initialOptions.trimStart || 0) + (initialOptions.trimSeconds || 0)
  );
  
  const [outputRatio, setOutputRatio] = useState<string>(initialOptions.outputRatio || (initialOptions.vertical ? '9:16' : 'original'));
  const [textOverlay, setTextOverlay] = useState<string>(initialOptions.textOverlay || "");
  const [textPosition, setTextPosition] = useState<string>(initialOptions.textPosition || 'center');
  const [textFontSize, setTextFontSize] = useState<number>(initialOptions.textFontSize || 24);
  const [textColor, setTextColor] = useState<string>(initialOptions.textColor || '#FFFFFF');
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        const d = videoRef.current!.duration;
        setDuration(d);
        if (!initialOptions.trimSeconds) {
          setTrimEnd(Math.floor(d));
        }
      };
    }
  }, [initialOptions.trimSeconds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSave = () => {
    const trimSeconds = trimEnd - trimStart;
    onSave({
      ...initialOptions,
      trimStart,
      trimSeconds,
      vertical: outputRatio === '9:16',
      outputRatio,
      textOverlay,
      textPosition,
      textFontSize,
      textColor,
    });
  };

  const getAspectClass = () => {
    switch (outputRatio) {
      case '9:16': return 'aspect-[9/16] object-cover';
      case '16:9': return 'aspect-video object-cover';
      case '1:1': return 'aspect-square object-cover';
      case '4:5': return 'aspect-[4/5] object-cover';
      default: return 'aspect-video object-contain';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-[90vw] h-[90vh] bg-card rounded-xl flex flex-col overflow-hidden relative shadow-2xl border border-border">
        <div className="flex items-center justify-between p-4 bg-muted/30 border-b">
          <h3 className="font-semibold text-lg">Video Editor</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Huỷ</Button>
            <Button size="sm" onClick={handleSave}>Lưu & Áp dụng</Button>
          </div>
        </div>
      
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 p-6 flex items-center justify-center bg-zinc-950">
            <div className="relative h-full w-full flex items-center justify-center">
               <video
                ref={videoRef}
                src={source}
                controls
                className={`max-h-full max-w-full rounded-lg shadow-xl ring-1 ring-white/10 ${getAspectClass()}`}
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime > trimEnd) {
                    videoRef.current.pause();
                    videoRef.current.currentTime = trimStart;
                  }
                }}
              />
            </div>
          </div>
          
          <div className="w-full lg:w-[480px] border-t lg:border-t-0 lg:border-l border-border p-6 flex flex-col gap-8 overflow-y-auto bg-muted/10">
            {/* Trim */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Cắt Video (Trim)</h4>
              </div>
              <TrimSlider 
                duration={duration} 
                start={trimStart} 
                end={trimEnd} 
                onChange={(s, e) => {
                  setTrimStart(s);
                  setTrimEnd(e);
                  if (videoRef.current) videoRef.current.currentTime = s;
                }} 
              />
            </div>

            {/* Ratio */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Tỉ lệ khung hình</h4>
              </div>
              <RatioPicker value={outputRatio} onChange={setOutputRatio} />
            </div>

            {/* Text Overlay */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Chèn chữ (Watermark)</h4>
              </div>
              
              <input
                type="text"
                placeholder="Nội dung chữ..."
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-muted-foreground">Vị trí</label>
                  <div className="grid grid-cols-3 gap-1 w-[120px] aspect-square bg-muted/50 p-1 rounded-md border border-input shadow-sm">
                    {['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                      <button
                        key={pos}
                        onClick={() => setTextPosition(pos)}
                        className={`w-full h-full rounded-sm transition-all ${textPosition === pos ? 'bg-primary shadow-sm ring-1 ring-primary/50' : 'hover:bg-background/80 bg-transparent'}`}
                        title={pos}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground flex justify-between">
                      <span>Cỡ chữ</span>
                      <span className="text-foreground">{textFontSize}px</span>
                    </label>
                    <input 
                      type="range" min="12" max="72" 
                      value={textFontSize} onChange={(e) => setTextFontSize(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground block">Màu chữ</label>
                    <div className="flex h-9 items-center rounded-md border border-input bg-background px-2 shadow-sm w-fit">
                      <input 
                        type="color" 
                        value={textColor} onChange={(e) => setTextColor(e.target.value)}
                        className="w-6 h-6 border-0 bg-transparent cursor-pointer p-0" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
