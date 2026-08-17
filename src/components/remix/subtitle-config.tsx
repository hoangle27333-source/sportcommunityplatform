"use client";

import React from "react";
import { ColorFieldWithOpacity } from "@/components/ui/color-field-with-opacity";

export interface SubtitleSettings {
  preset?: "tiktok_bold" | "meme" | "pop" | "bubble" | "neon" | "clean";
  font: string;
  size: number;
  color: string;
  bgColor: string;
  highlightColor?: string;
  bold: boolean;
  italic: boolean;
  outline: number;
  borderStyle: number; // 0=none, 1=outline, 3=opaque box
  backgroundBlur?: boolean; // blur effect when borderStyle === 3
  position: 'top' | 'bottom' | 'auto' | 'custom';
  customY?: number;
  animation?: "static" | "word_highlight" | "reveal_words";
}

export const defaultSubtitleSettings: SubtitleSettings = {
  preset: 'tiktok_bold',
  font: 'Arial',
  size: 36,
  color: '#FFFFFF',
  bgColor: '#000000',
  highlightColor: '#FFF200',
  bold: true,
  italic: false,
  outline: 3,
  borderStyle: 1,
  backgroundBlur: false,
  position: 'auto',
  customY: 0.78,
  animation: 'word_highlight',
};

type SubtitlePresetKey = "tiktok_bold" | "meme" | "pop" | "bubble" | "neon" | "clean";

const SUBTITLE_PRESETS: Record<SubtitlePresetKey, {
  label: string;
  font: string;
  size: number;
  color: string;
  bgColor: string;
  highlightColor?: string;
  bold: boolean;
  borderStyle: number;
  outline: number;
  animation?: "static" | "word_highlight" | "reveal_words";
}> = {
  tiktok_bold: { label: "TikTok Bold", font: "Montserrat", size: 36, color: "#FFFFFF", bgColor: "#000000", highlightColor: "#FFF200", bold: true, borderStyle: 1, outline: 3, animation: "word_highlight" },
  meme: { label: "Meme Impact", font: "Anton", size: 34, color: "#FFFFFF", bgColor: "#000000", bold: true, borderStyle: 3, outline: 2 },
  pop: { label: "Pop Sticker", font: "Montserrat", size: 34, color: "#FFF200", bgColor: "#FF2A6D", bold: true, borderStyle: 3, outline: 2 },
  bubble: { label: "Bubble", font: "Baloo 2", size: 32, color: "#111111", bgColor: "#FFFFFF", bold: true, borderStyle: 3, outline: 2 },
  neon: { label: "Neon Reel", font: "Oswald", size: 32, color: "#00F5FF", bgColor: "#090A18", bold: true, borderStyle: 3, outline: 2 },
  clean: { label: "Clean Caption", font: "Be Vietnam Pro", size: 28, color: "#FFFFFF", bgColor: "#111827", bold: false, borderStyle: 1, outline: 2 },
};

export function SubtitleConfig({
  value,
  onChange,
  title = "Cấu hình phụ đề",
  sampleText = "Đây là phụ đề mẫu",
  autoDescription = "AI tự phát hiện vị trí phụ đề gốc (thường bottom 18%) và chèn phụ đề mới trong vùng đã làm mờ. Nếu không phát hiện được, mặc định đặt ở dưới cùng.",
}: {
  value: SubtitleSettings;
  onChange: (s: SubtitleSettings) => void;
  title?: string;
  sampleText?: string;
  autoDescription?: string;
}) {
  const update = (updates: Partial<SubtitleSettings>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20">
      <h4 className="text-sm font-medium">{title}</h4>
      
      {/* Preset buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(Object.entries(SUBTITLE_PRESETS) as Array<[SubtitlePresetKey, typeof SUBTITLE_PRESETS[SubtitlePresetKey]]>).map(([key, style]) => (
          <button
            key={key}
            type="button"
            onClick={() => update({
              font: style.font,
              size: style.size,
              color: style.color,
              bgColor: style.bgColor,
              highlightColor: style.highlightColor ?? value.highlightColor,
              bold: style.bold,
              borderStyle: style.borderStyle,
              outline: style.outline,
              preset: key,
              animation: style.animation ?? value.animation ?? "static",
              customY: value.customY ?? 0.78,
            })}
            className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              value.font === style.font && value.color === style.color
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>

      {/* Font & Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Font chữ</label>
          <select
            value={value.font}
            onChange={(e) => update({ font: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            <option value="Anton">Anton (Meme / Impact - Việt hoá)</option>
            <option value="Oswald">Oswald (Condensed - Việt hoá)</option>
            <option value="Be Vietnam Pro">Be Vietnam Pro (Tiêu chuẩn - Việt hoá)</option>
            <option value="Montserrat">Montserrat (Hiện đại - Việt hoá)</option>
            <option value="Nunito">Nunito (Bo tròn - Việt hoá)</option>
            <option value="Baloo 2">Baloo 2 (Sticker - Việt hoá)</option>
            <option value="Inter">Inter (Tối giản - Việt hoá)</option>
            <option value="Impact">Impact (Cơ bản)</option>
            <option value="Arial">Arial (Cơ bản)</option>
            <option value="Arial Black">Arial Black (Cơ bản)</option>
            <option value="Noto Sans">Noto Sans (Cơ bản)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Kích cỡ</label>
          <input
            type="number"
            min={12}
            max={72}
            value={value.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          />
        </div>
      </div>

      {/* Colors & Styles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorFieldWithOpacity
          label="Màu chữ"
          value={value.color}
          onChange={(next) => update({ color: next })}
          fallback="#FFFFFF"
        />
        <ColorFieldWithOpacity
          label="Màu nền / viền"
          value={value.bgColor}
          onChange={(next) => update({ bgColor: next })}
          fallback="#000000"
        />
        <ColorFieldWithOpacity
          label="Màu nhấn từng từ"
          value={value.highlightColor ?? "#FFF200"}
          onChange={(next) => update({ highlightColor: next })}
          fallback="#FFF200"
        />
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
          <input
            type="checkbox"
            checked={value.bold}
            onChange={(e) => update({ bold: e.target.checked })}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          Đậm
        </label>
        <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
          <input
            type="checkbox"
            checked={value.italic}
            onChange={(e) => update({ italic: e.target.checked })}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          Nghiêng
        </label>
      </div>

      {/* Border Style & Outline Thickness */}
      <div className="space-y-2 pt-1">
        <label className="text-xs text-muted-foreground block">Hiệu ứng hiển thị</label>
        <div className="flex flex-wrap gap-4 mb-3">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={(value.animation ?? 'static') === 'static'} onChange={() => update({ animation: 'static' })} />
            Tĩnh
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.animation === 'word_highlight'} onChange={() => update({ animation: 'word_highlight' })} />
            Highlight từng chữ
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.animation === 'reveal_words'} onChange={() => update({ animation: 'reveal_words' })} />
            Nhả từng chữ
          </label>
        </div>
        <label className="text-xs text-muted-foreground block">Kiểu đường viền / nền</label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 0} onChange={() => update({ borderStyle: 0, backgroundBlur: false })} />
            Không có
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 1} onChange={() => update({ borderStyle: 1, backgroundBlur: false })} />
            Viền chữ
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 3 && !value.backgroundBlur} onChange={() => update({ borderStyle: 3, backgroundBlur: false })} />
            Hộp nền
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={value.borderStyle === 3 && !!value.backgroundBlur} onChange={() => update({ borderStyle: 3, backgroundBlur: true })} />
            Hộp nền mờ (blur)
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

      {/* Position */}
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
            Auto
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-sm transition-all ${
              value.position === 'custom'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => update({ position: 'custom', customY: value.customY ?? 0.78 })}
          >
            Custom
          </button>
        </div>
        {value.position === 'auto' && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 border border-border/50 leading-relaxed">
            {autoDescription}
          </p>
        )}
        {value.position === 'custom' && (
          <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-md border border-border/50">
            <span className="text-xs text-muted-foreground">Y</span>
            <input
              type="range"
              min={0.05}
              max={0.9}
              step={0.01}
              className="w-44"
              value={value.customY ?? 0.78}
              onChange={(e) => update({ customY: Number(e.target.value) })}
            />
            <span className="text-xs font-medium tabular-nums">{Math.round((value.customY ?? 0.78) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Preview Box */}
      <div className="rounded-md bg-zinc-950 p-4 text-center min-h-[90px] flex items-center justify-center relative overflow-hidden border border-border/50">
        {value.borderStyle === 3 && value.backgroundBlur && (
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: 'blur(12px)',
              backgroundColor: `${value.bgColor}99`,
            }}
          />
        )}
        <span
          className="relative inline-block rounded px-3 py-1 leading-tight max-w-full break-words"
          style={{
            fontFamily: value.font,
            fontSize: `${Math.min(Number(value.size) || 24, 38)}px`,
            color: value.color,
            ...(value.borderStyle === 3 && !value.backgroundBlur ? { backgroundColor: value.bgColor } : {}),
            ...(value.borderStyle === 1 ? { WebkitTextStroke: `${value.outline || 1}px ${value.bgColor}` } : {}),
            fontWeight: value.bold ? 800 : 500,
            fontStyle: value.italic ? 'italic' : 'normal',
          }}
        >
          {value.animation === 'word_highlight' ? (
            <>
              <span style={{ color: value.highlightColor ?? '#FFF200' }}>{sampleText.split(' ')[0]}</span>
              {' '}
              {sampleText.split(' ').slice(1).join(' ')}
            </>
          ) : value.animation === 'reveal_words' ? (
            <>
              <span style={{ color: value.highlightColor ?? '#FFF200' }}>{sampleText.split(' ')[0]}</span>
              {' '}
              {sampleText.split(' ').slice(1, 3).join(' ')}
            </>
          ) : sampleText}
        </span>
      </div>
    </div>
  );
}
