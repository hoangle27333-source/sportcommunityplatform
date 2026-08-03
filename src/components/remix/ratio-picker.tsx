"use client";

import React from 'react';

interface RatioPickerProps {
  value: string;
  onChange: (ratio: string) => void;
}

const RATIOS = [
  { key: '9:16', label: 'Dọc', width: 27, height: 48 },
  { key: '16:9', label: 'Ngang', width: 48, height: 27 },
  { key: '1:1', label: 'Vuông', width: 36, height: 36 },
  { key: '4:5', label: 'Chân dung', width: 32, height: 40 },
  { key: 'original', label: 'Gốc', width: 36, height: 36 },
];

export function RatioPicker({ value, onChange }: RatioPickerProps) {
  return (
    <div className="flex gap-2 w-full justify-between">
      {RATIOS.map((r) => {
        const isSelected = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all flex-1 min-w-[70px] ${
              isSelected ? 'border-primary ring-2 ring-primary/20 bg-primary/10' : 'border-border bg-background hover:bg-muted'
            }`}
          >
            <div className="h-12 w-12 flex items-center justify-center mb-1">
              <div
                className={`border-2 ${isSelected ? 'border-primary bg-primary/20' : 'border-muted-foreground/50'}`}
                style={{ width: `${r.width}px`, height: `${r.height}px` }}
              >
                {r.key === 'original' && (
                  <svg className="w-full h-full p-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
              </div>
            </div>
            <span className={`text-[10px] font-medium leading-tight ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
              {r.key}
            </span>
            <span className={`text-xs leading-tight ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
              {r.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
