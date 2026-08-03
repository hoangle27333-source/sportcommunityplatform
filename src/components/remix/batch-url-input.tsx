"use client";

import React, { useState } from "react";
import { X, CheckCircle2, XCircle } from "lucide-react";

export function BatchURLInput({ value, onChange, maxUrls = 10 }: { value: string[], onChange: (urls: string[]) => void, maxUrls?: number }) {
  const [text, setText] = useState(value.join('\n'));

  const validateUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const getPlatformName = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('facebook.com')) return 'Facebook';
    if (url.includes('douyin.com')) return 'Douyin';
    return 'Link';
  };

  const handleBlur = () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const validUrls = lines.filter(validateUrl).slice(0, maxUrls);
    onChange(validUrls);
    setText(lines.join('\n'));
  };

  const removeUrl = (index: number) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    lines.splice(index, 1);
    const newText = lines.join('\n');
    setText(newText);
    const validUrls = lines.filter(validateUrl).slice(0, maxUrls);
    onChange(validUrls);
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <textarea
        className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Dán các link video vào đây, mỗi link một dòng..."
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
      />
      
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Danh sách Link ({lines.length})</span>
        <span>{value.length} / {maxUrls} URL hợp lệ</span>
      </div>

      {lines.length > 0 && (
        <div className="space-y-2 max-h-[250px] overflow-y-auto scrollbar-thin">
          {lines.map((line, i) => {
            const isValid = validateUrl(line);
            const isOverLimit = isValid && value.indexOf(line) === -1 && i >= maxUrls;
            const status = isValid && !isOverLimit ? 'valid' : 'invalid';
            
            return (
              <div key={i} className={`flex items-center justify-between p-2 rounded-md text-sm border ${status === 'valid' ? 'border-border bg-muted/20' : 'border-destructive/30 bg-destructive/5'}`}>
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  {status === 'valid' ? <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" /> : <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                  <span className="font-medium text-[10px] uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground flex-shrink-0">
                    {isValid ? getPlatformName(line) : 'Lỗi'}
                  </span>
                  <span className="truncate text-muted-foreground">{line.length > 60 ? line.substring(0, 60) + '...' : line}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeUrl(i)}
                  className="p-1 hover:bg-muted rounded text-muted-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
