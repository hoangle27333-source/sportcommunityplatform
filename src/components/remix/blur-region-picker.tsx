"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface BlurRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BlurRegionPickerProps {
  videoUrl?: string;
  region: BlurRegion;
  onChange: (region: BlurRegion) => void;
  defaultEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Bật chế độ AI tự detect vùng phụ đề gốc (thay thế chọn vùng thủ công). */
  autoDetect?: boolean;
  onAutoDetectChange?: (enabled: boolean) => void;
}

export function BlurRegionPicker({ videoUrl, region, onChange, defaultEnabled, onToggle, autoDetect, onAutoDetectChange }: BlurRegionPickerProps) {
  const [preset, setPreset] = useState<'18' | '25' | 'custom'>('18');

  const applyPreset = (p: '18' | '25' | 'custom') => {
    setPreset(p);
    if (p === '18') {
      onChange({ x: 0, y: 0.82, w: 1, h: 0.18 });
    } else if (p === '25') {
      onChange({ x: 0, y: 0.75, w: 1, h: 0.25 });
    }
  };

  return (
    <div className="space-y-4 border rounded-md p-4 bg-muted/10">
      <div className="flex items-center gap-3">
        <input 
          type="checkbox" 
          id="blur-toggle"
          className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          checked={defaultEnabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <label htmlFor="blur-toggle" className="font-semibold text-sm cursor-pointer">Blur phụ đề gốc</label>
      </div>

      {defaultEnabled && (
        <div className="space-y-4 pt-3 border-t">
          {/* Chế độ AI Auto-Detect */}
          <div 
            className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-md p-3 cursor-pointer select-none hover:bg-primary/10 transition-colors"
            onClick={() => onAutoDetectChange?.(!autoDetect)}
          >
            <input
              type="checkbox"
              id="auto-detect-toggle"
              className="h-4 w-4 mt-0.5 rounded border-input text-primary focus:ring-primary pointer-events-none"
              checked={autoDetect ?? false}
              readOnly
            />
            <div>
              <label className="text-sm font-medium cursor-pointer flex items-center gap-1.5 pointer-events-none">
                🤖 AI tự phát hiện vùng phụ đề gốc
              </label>
              <p className="text-xs text-muted-foreground mt-0.5 pointer-events-none">
                Gemini Vision phân tích 3 khung hình để xác định chính xác vùng phụ đề.
                Nếu không tìm thấy, video sẽ không bị làm mờ.
              </p>
            </div>
          </div>

          {/* Chọn vùng thủ công — ẩn khi bật Auto-Detect */}
          {!autoDetect && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant={preset === '18' ? 'primary' : 'outline'} size="sm" onClick={() => applyPreset('18')}>
                  Dưới cùng 18%
                </Button>
                <Button type="button" variant={preset === '25' ? 'primary' : 'outline'} size="sm" onClick={() => applyPreset('25')}>
                  Dưới cùng 25%
                </Button>
                <Button type="button" variant={preset === 'custom' ? 'primary' : 'outline'} size="sm" onClick={() => applyPreset('custom')}>
                  Tuỳ chỉnh
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="relative aspect-video bg-black rounded-md overflow-hidden border border-border">
                  {videoUrl ? (
                    <video src={videoUrl} className="w-full h-full object-cover opacity-50" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs text-muted-foreground">Thumbnail</div>
                  )}
                  <div 
                    className="absolute bg-purple-500/40 border-2 border-purple-500"
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.w * 100}%`,
                      height: `${region.h * 100}%`
                    }}
                  />
                </div>

                {preset === 'custom' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>X: {region.x.toFixed(2)}</span></div>
                      <input type="range" min="0" max="1" step="0.01" value={region.x} onChange={e => onChange({...region, x: parseFloat(e.target.value)})} className="w-full" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>Y: {region.y.toFixed(2)}</span></div>
                      <input type="range" min="0" max="1" step="0.01" value={region.y} onChange={e => onChange({...region, y: parseFloat(e.target.value)})} className="w-full" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>Width: {region.w.toFixed(2)}</span></div>
                      <input type="range" min="0" max="1" step="0.01" value={region.w} onChange={e => onChange({...region, w: parseFloat(e.target.value)})} className="w-full" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>Height: {region.h.toFixed(2)}</span></div>
                      <input type="range" min="0" max="1" step="0.01" value={region.h} onChange={e => onChange({...region, h: parseFloat(e.target.value)})} className="w-full" />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

