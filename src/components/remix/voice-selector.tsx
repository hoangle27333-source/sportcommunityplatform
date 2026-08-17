"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, Volume2, Star } from "lucide-react";

interface VoiceInfo {
  name: string;
  gender: 'male' | 'female';
  region: string;
  style: string;
  tier: 'wavenet' | 'standard' | 'neural2';
  note?: string;
}

export function VoiceSelector({ value, onChange, disabled }: { value: string, onChange: (v: string) => void, disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [tab, setTab] = useState<'all' | 'favorites'>('all');
  const [gender, setGender] = useState('Tất cả');
  const [region, setRegion] = useState('Tất cả');
  const [style, setStyle] = useState('Tất cả');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (open) {
      fetchVoices();
      fetchFavorites();
    }
  }, [open, gender, region, style]);

  const fetchVoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (gender !== 'Tất cả') params.append('gender', gender === 'Nữ' ? 'female' : 'male');
      if (region !== 'Tất cả') params.append('region', region);
      if (style !== 'Tất cả') params.append('style', style);
      
      const res = await fetch(`/api/remix/voices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVoices(data.voices || []);
      } else {
        // Mock data for UI development if API is not yet implemented
        setVoices([
          { name: 'vi-VN-WaveNet-A', gender: 'female', region: 'Bắc', style: 'Tự nhiên', tier: 'wavenet' },
          { name: 'vi-VN-WaveNet-B', gender: 'male', region: 'Bắc', style: 'Trầm ấm', tier: 'wavenet' },
          { name: 'vi-VN-WaveNet-C', gender: 'female', region: 'Nam', style: 'Trẻ trung', tier: 'wavenet' },
          { name: 'vi-VN-Neural2-A', gender: 'female', region: 'Bắc', style: 'Chuyên nghiệp', tier: 'neural2' },
          { name: 'vi-VN-Neural2-D', gender: 'male', region: 'Nam', style: 'Tiêu chuẩn', tier: 'neural2' },
        ]);
      }
    } catch (e) {
      console.error(e);
      // Fallback
      setVoices([
        { name: 'vi-VN-WaveNet-A', gender: 'female', region: 'Bắc', style: 'Tự nhiên', tier: 'wavenet' },
        { name: 'vi-VN-WaveNet-B', gender: 'male', region: 'Bắc', style: 'Trầm ấm', tier: 'wavenet' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/remix/voices/favorites');
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, voiceName: string) => {
    e.stopPropagation();
    const isFav = favorites.includes(voiceName);
    try {
      const method = isFav ? 'DELETE' : 'POST';
      await fetch('/api/remix/voices/favorites', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceName })
      });
      setFavorites(prev => isFav ? prev.filter(v => v !== voiceName) : [...prev, voiceName]);
    } catch (e) {
      console.error(e);
      // Optimistic update fallback
      setFavorites(prev => isFav ? prev.filter(v => v !== voiceName) : [...prev, voiceName]);
    }
  };

  const playPreview = async (e: React.MouseEvent, voiceName: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/remix/voices?preview=${voiceName}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredVoices = tab === 'favorites' ? voices.filter(v => favorites.includes(v.name)) : voices;
  
  const formatVoiceName = (name: string) => {
    return name.replace('vi-VN-', '').replace('-', ' ');
  };

  return (
    <>
      <Button
        variant="outline"
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full justify-between bg-background"
      >
        {value ? formatVoiceName(value) : "Chọn giọng lồng tiếng"}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl max-h-[85vh] bg-background rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/95 sticky top-0 z-10">
              <h3 className="text-lg font-semibold">Chọn giọng lồng tiếng</h3>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Giới tính</label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={gender} onChange={e => setGender(e.target.value)}>
                    <option>Tất cả</option>
                    <option>Nữ</option>
                    <option>Nam</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Vùng miền</label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={region} onChange={e => setRegion(e.target.value)}>
                    <option>Tất cả</option>
                    <option>Bắc</option>
                    <option>Nam</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Phong cách</label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={style} onChange={e => setStyle(e.target.value)}>
                    <option>Tất cả</option>
                    <option>Trẻ trung</option>
                    <option>Tự nhiên</option>
                    <option>Trầm ấm</option>
                    <option>Chuyên nghiệp</option>
                    <option>Tiêu chuẩn</option>
                  </select>
                </div>
              </div>
              
              <div className="tab-bar">
                <button
                  type="button"
                  aria-selected={tab === 'all'}
                  className="tab-item"
                  onClick={() => setTab('all')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  aria-selected={tab === 'favorites'}
                  className="tab-item"
                  onClick={() => setTab('favorites')}
                >
                  ⭐ Yêu thích
                </button>
              </div>
              
              <div className="overflow-y-auto h-[350px] space-y-2 pr-2 scrollbar-thin">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
                ) : filteredVoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Không tìm thấy giọng đọc phù hợp.</div>
                ) : (
                  filteredVoices.map(v => (
                    <div
                      key={v.name}
                      onClick={() => {
                        onChange(v.name);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${value === v.name ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card'}`}
                    >
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {formatVoiceName(v.name)}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{v.gender === 'female' ? 'Nữ' : 'Nam'}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{v.region}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{v.style}</span>
                          {v.tier === 'wavenet' || v.tier === 'standard' ? (
                            <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-medium">Miễn phí</span>
                          ) : (
                            <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-medium">💰 Premium</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(e) => playPreview(e, v.name)}>
                          <Volume2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className={`h-8 w-8 ${favorites.includes(v.name) ? 'text-warning' : 'text-muted-foreground hover:text-foreground'}`} onClick={(e) => toggleFavorite(e, v.name)}>
                          <Star className="h-4 w-4" fill={favorites.includes(v.name) ? "currentColor" : "none"} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
