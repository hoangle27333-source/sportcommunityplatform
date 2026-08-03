"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic } from "lucide-react";

export interface SubtitleSettings {
  font: string;
  size: number;
  color: string;
  bgColor: string;
  bold: boolean;
  italic: boolean;
  outline: number;
  borderStyle: number; // 0=none, 1=outline, 3=opaque box
  position: 'top' | 'bottom' | 'auto';
}

export const defaultSubtitleSettings: SubtitleSettings = {
  font: 'Arial',
  size: 24,
  color: '#FFFFFF',
  bgColor: '#000000',
  bold: false,
  italic: false,
  outline: 2,
  borderStyle: 3,
  position: 'auto',
};

export function SubtitleConfig({ value, onChange }: { value: SubtitleSettings, onChange: (s: SubtitleSettings) => void }) {
  const update = (updates: Partial<SubtitleSettings>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className="border border-border rounded-md p-4 space-y-4 bg-muted/20">
      <h4 className="text-sm font-medium">Cấu hình phụ đề</h4>
      
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[120px] space-y-1">
          <label className="text-xs text-muted-foreground">Phông chữ</label>
          <select 
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" 
            value={value.font} 
            onChange={(e) => update({ font: e.target.value })}
          >
            <option value="Arial">Arial</option>
            <option value="Roboto">Roboto</option>
            <option value="Noto Sans">Noto Sans</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </div>
        <div className="w-[80px] space-y-1">
          <label className="text-xs text-muted-foreground">Kích cỡ</label>
          <input 
            type="number" min={12} max={72} 
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" 
            value={value.size} 
            onChange={(e) => update({ size: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">Màu chữ</label>
          <div className="flex h-9 items-center rounded-md border border-input bg-background px-2 shadow-sm">
            <input 
              type="color" 
              className="w-6 h-6 border-0 bg-transparent cursor-pointer p-0" 
              value={value.color} 
              onChange={(e) => update({ color: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">Màu nền</label>
          <div className="flex h-9 items-center rounded-md border border-input bg-background px-2 shadow-sm">
            <input 
              type="color" 
              className="w-6 h-6 border-0 bg-transparent cursor-pointer p-0" 
              value={value.bgColor} 
              onChange={(e) => update({ bgColor: e.target.value })}
            />
          </div>
        </div>
        
        <div className="flex h-9 items-center gap-1 bg-muted/50 border border-input p-1 rounded-md shadow-sm">
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className={`h-7 w-7 rounded-sm ${value.bold ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}
            onClick={() => update({ bold: !value.bold })}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className={`h-7 w-7 rounded-sm ${value.italic ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}
            onClick={() => update({ italic: !value.italic })}
          >
            <Italic className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Đường viền & Nền</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 0} onChange={() => update({ borderStyle: 0 })} />
            Không có
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 1} onChange={() => update({ borderStyle: 1 })} />
            Viền chữ
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 3} onChange={() => update({ borderStyle: 3 })} />
            Hộp nền
          </label>
        </div>
        
        {value.borderStyle === 1 && (
          <div className="flex items-center gap-2 mt-2 bg-muted/30 p-2 rounded-md border border-border/50">
            <span className="text-xs text-muted-foreground">Độ dày viền:</span>
            <input 
              type="range" min={1} max={5} 
              className="w-32" 
              value={value.outline} 
              onChange={(e) => update({ outline: Number(e.target.value) })}
            />
            <span className="text-xs font-medium">{value.outline}px</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Vị trí</label>
        <div className="flex gap-1 bg-muted/50 border border-input p-1 rounded-md w-fit shadow-sm">
          <button 
            type="button"
            className={`px-3 py-1 text-xs rounded-sm transition-all ${value.position === 'top' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => update({ position: 'top' })}
          >Trên</button>
          <button 
            type="button"
            className={`px-3 py-1 text-xs rounded-sm transition-all ${value.position === 'bottom' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => update({ position: 'bottom' })}
          >Dưới</button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-sm transition-all flex items-center gap-1 ${
              value.position === 'auto'
                ? 'bg-primary/10 shadow-sm font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => update({ position: 'auto' })}
          >
            🤖 Auto
          </button>
        </div>
        {value.position === 'auto' && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 border border-border/50 leading-relaxed">
            AI tự phát hiện vị trí phụ đề gốc (thường bottom 18%) và chèn phụ đề mới trong vùng đã làm mờ. Nếu không phát hiện được, mặc định đặt ở dưới cùng.
          </p>
        )}
      </div>

      <div className="mt-4 border rounded-md h-32 bg-zinc-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 to-zinc-900 flex items-center justify-center p-4 relative overflow-hidden shadow-inner">
        <div 
          className="absolute w-full flex justify-center text-center leading-snug"
          style={{
            fontFamily: value.font,
            fontSize: `${value.size}px`,
            color: value.color,
            fontWeight: value.bold ? 'bold' : 'normal',
            fontStyle: value.italic ? 'italic' : 'normal',
            ...(value.borderStyle === 3 ? { backgroundColor: value.bgColor, padding: '4px 8px' } : {}),
            ...(value.borderStyle === 1 ? { WebkitTextStroke: `${value.outline}px ${value.bgColor}` } : {}),
            top: value.position === 'top' ? '15%' : 'auto',
            bottom: value.position === 'bottom' ? '15%' : 'auto',
          }}
        >
          <span style={value.borderStyle === 1 ? { position: 'relative' } : {}}>
            {value.borderStyle === 1 && (
              <span style={{ position: 'absolute', left: 0, top: 0, WebkitTextStroke: '0', color: value.color, zIndex: 1 }}>Đây là phụ đề mẫu</span>
            )}
            <span style={{ position: 'relative', zIndex: 0 }}>Đây là phụ đề mẫu</span>
          </span>
        </div>
      </div>
    </div>
  );
}
