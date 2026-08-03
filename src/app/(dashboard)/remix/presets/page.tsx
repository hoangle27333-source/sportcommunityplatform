"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Check, Edit2, Trash2 } from "lucide-react";
import { VoiceSelector } from "@/components/remix/voice-selector";
import { SubtitleConfig, defaultSubtitleSettings, type SubtitleSettings } from "@/components/remix/subtitle-config";
import { RatioPicker } from "@/components/remix/ratio-picker";
import { BlurRegionPicker, type BlurRegion } from "@/components/remix/blur-region-picker";

export default function PresetPage() {
  const [presets, setPresets] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("vi-VN-WaveNet-A");
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleSettings>(defaultSubtitleSettings);
  const [ratio, setRatio] = useState("9:16");
  const [crf, setCrf] = useState("18");
  const [blurOriginalSub, setBlurOriginalSub] = useState(false);
  const [autoDetectSub, setAutoDetectSub] = useState(false);
  const [blurRegion, setBlurRegion] = useState<BlurRegion>({ x: 0, y: 0.82, w: 1, h: 0.18 });
  const [intro, setIntro] = useState(false);
  const [introMediaId, setIntroMediaId] = useState("");
  const [outro, setOutro] = useState(false);
  const [outroMediaId, setOutroMediaId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<'vi' | 'en'>('vi');
  const [dubMode, setDubMode] = useState<'none' | 'full' | 'preserve_bgm'>('none');

  const fetchPresets = async () => {
    try {
      const res = await fetch("/api/remix/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const openCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setName("");
    setVoice("vi-VN-WaveNet-A");
    setSubtitleConfig(defaultSubtitleSettings);
    setRatio("9:16");
    setCrf("18");
    setBlurOriginalSub(false);
    setAutoDetectSub(false);
    setTargetLanguage('vi');
    setDubMode('none');
    setVoice('vi-VN-WaveNet-A');
    setIntro(false);
    setIntroMediaId("");
    setOutro(false);
    setOutroMediaId("");
  };

  const openEdit = (p: any) => {
    setIsCreating(true);
    setEditingId(p.id);
    setName(p.name || "");
    setVoice(p.voice_name || "vi-VN-WaveNet-A");
    setSubtitleConfig({
      font: p.sub_font || defaultSubtitleSettings.font,
      size: p.sub_font_size || defaultSubtitleSettings.size,
      color: p.sub_color || defaultSubtitleSettings.color,
      bgColor: p.sub_bg_color || defaultSubtitleSettings.bgColor,
      bold: p.sub_bold ?? defaultSubtitleSettings.bold,
      italic: p.sub_italic ?? defaultSubtitleSettings.italic,
      outline: p.sub_outline ?? defaultSubtitleSettings.outline,
      borderStyle: p.sub_border_style !== undefined ? p.sub_border_style : defaultSubtitleSettings.borderStyle,
      position: p.sub_position || defaultSubtitleSettings.position,
    });
    setRatio(p.output_ratio || "9:16");
    setCrf(p.output_crf?.toString() || "18");
    setBlurOriginalSub(p.blur_original_sub ?? false);
    setAutoDetectSub(p.auto_detect_subtitle_region ?? false);
    if (p.blur_region) setBlurRegion(p.blur_region);
    const lang = (p.target_language === 'en' ? 'en' : 'vi') as 'vi' | 'en';
    setTargetLanguage(lang);
    const savedDubMode = (p.dub_mode as 'none' | 'full' | 'preserve_bgm') ?? (p.auto_dub ? 'full' : 'none');
    setDubMode(savedDubMode);
    setIntro(p.intro_enabled ?? false);
    setIntroMediaId(p.intro_media_id || "");
    setOutro(p.outro_enabled ?? false);
    setOutroMediaId(p.outro_media_id || "");
  };

  const handleSave = async () => {
    try {
      const payload = {
        name,
        voiceName: voice,
        subFont: subtitleConfig.font,
        subFontSize: subtitleConfig.size,
        subColor: subtitleConfig.color,
        subBgColor: subtitleConfig.bgColor,
        subBold: subtitleConfig.bold,
        subItalic: subtitleConfig.italic,
        subOutline: subtitleConfig.outline,
        subBorderStyle: subtitleConfig.borderStyle,
        subPosition: subtitleConfig.position,
        outputRatio: ratio,
        outputCrf: Number(crf),
        blurOriginalSub,
        autoDetectSubtitleRegion: autoDetectSub,
        blurRegion,
        targetLanguage,
        dubMode,
        autoDub: dubMode !== 'none',
        autoVietsub: true,
        introEnabled: intro,
        introMediaId: introMediaId.trim() || null,
        outroEnabled: outro,
        outroMediaId: outroMediaId.trim() || null,
      };

      const url = editingId ? `/api/remix/presets/${editingId}` : '/api/remix/presets';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Lỗi lưu preset');
      }

      await fetchPresets();
      setIsCreating(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá preset này?")) return;
    try {
      const res = await fetch(`/api/remix/presets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Xoá thất bại');
      await fetchPresets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/remix/presets/${id}/default`, { method: 'POST' });
      if (!res.ok) throw new Error('Thiết lập mặc định thất bại');
      await fetchPresets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình Preset Remix"
        description="Quản lý các cấu hình lồng tiếng, phụ đề và đầu ra video mặc định cho hệ thống auto-generate."
      />
      
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Danh sách Preset</h2>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo Preset mới
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse">Đang tải presets...</div>
      ) : presets.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground border rounded-lg bg-muted/10">Chưa có preset nào.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {presets.map(p => (
            <div key={p.id} className={`border ${p.isDefault ? 'border-primary shadow-sm bg-primary/5' : 'border-border bg-card shadow-sm'} rounded-lg p-5 space-y-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  {p.is_default && <span className="inline-block mt-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">Mặc định</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Giọng đọc: <span className="font-medium text-foreground">{p.voice_name || 'Mặc định'}</span></p>
                <p>Tỉ lệ: <span className="font-medium text-foreground">{p.output_ratio || '9:16'}</span> • CRF: <span className="font-medium text-foreground">{p.output_crf || '18'}</span></p>
                <p>Lồng tiếng: <span className="font-medium text-foreground">
                  {p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc nền' : p.dub_mode === 'full' ? '🎙️ Thay audio' : '🔇 Tắt'}
                </span></p>
              </div>
              
              {!p.is_default && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleSetDefault(p.id)}>
                  <Check className="h-4 w-4 mr-2" /> Đặt làm mặc định
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="border border-border rounded-xl p-6 bg-card space-y-6 shadow-sm">
          <div className="flex justify-between items-center border-b border-border pb-4">
            <h3 className="font-semibold text-lg">{editingId ? 'Chỉnh sửa Preset' : 'Tạo Preset mới'}</h3>
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Huỷ</Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Tên Preset</label>
                <input 
                  type="text" 
                  value={name} onChange={e => setName(e.target.value)} 
                  className="w-full h-10 rounded-md border border-input bg-background px-3 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" 
                  placeholder="VD: Reels Tiktok..."
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Chế độ lồng tiếng</label>
                <div className="space-y-2">
                  {([
                    { value: 'none', icon: '🔇', label: 'Không lồng tiếng', desc: 'Giữ nguyên âm thanh gốc của video.' },
                    { value: 'full', icon: '🎙️', label: 'Lồng tiếng AI (thay toàn bộ audio)', desc: 'Thay audio gốc bằng giọng đọc AI. Phù hợp khi không có nhạc nền.' },
                    { value: 'preserve_bgm', icon: '🎵', label: 'Lồng tiếng AI + Giữ nhạc nền', desc: 'AI tự động tách giọng người khỏi nhạc nền, lồng giọng TTS mới và mix lại với nhạc nền gốc.' },
                  ] as const).map(opt => (
                    <label
                      key={opt.value}
                      onClick={() => setDubMode(opt.value)}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                        dubMode === opt.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          dubMode === opt.value ? 'border-primary' : 'border-muted-foreground'
                        }`}>
                          {dubMode === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">{opt.icon} {opt.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {dubMode !== 'none' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Ngôn ngữ lồng tiếng</label>
                    <div className="flex gap-1 bg-muted/50 border border-input p-1 rounded-md w-fit shadow-sm mb-3">
                      <button
                        type="button"
                        className={`px-4 py-1.5 text-sm rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'vi' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => { setTargetLanguage('vi'); setVoice('vi-VN-WaveNet-A'); }}
                      >🇻🇳 Tiếng Việt</button>
                      <button
                        type="button"
                        className={`px-4 py-1.5 text-sm rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'en' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => { setTargetLanguage('en'); setVoice('en-US-WaveNet-C'); }}
                      >🇺🇸 Tiếng Anh</button>
                    </div>
                    <p className="text-xs text-muted-foreground">Ngôn ngữ dùng để dịch và tổng hợp giọng lồng tiếng.</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Giọng lồng tiếng</label>
                    <VoiceSelector value={voice} onChange={setVoice} />
                  </div>
                </>
              )}
              
              <div className="space-y-4 pt-4 border-t border-border">
                <label className="text-sm font-medium block">Cấu hình đầu ra</label>
                <RatioPicker value={ratio} onChange={setRatio} />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">Chất lượng nén (CRF: {crf})</label>
                <input 
                  type="range" min={18} max={28} 
                  value={crf} onChange={e => setCrf(e.target.value)} 
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">Càng thấp càng nét, file càng nặng (Mặc định: 18)</p>
              </div>
              
              <div className="space-y-4 pt-4 border-t border-border">
                <BlurRegionPicker 
                  region={blurRegion}
                  onChange={setBlurRegion}
                  defaultEnabled={blurOriginalSub}
                  onToggle={(v) => {
                    setBlurOriginalSub(v);
                    if (!v) setAutoDetectSub(false);
                  }}
                  autoDetect={autoDetectSub}
                  onAutoDetectChange={setAutoDetectSub}
                />
                
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" checked={intro} onChange={e => setIntro(e.target.checked)} />
                    Tự động chèn Intro
                  </label>
                  {intro && (
                    <input 
                      type="text" placeholder="URL hoặc Media ID của Intro..."
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ml-7 shadow-sm"
                      value={introMediaId} onChange={e => setIntroMediaId(e.target.value)}
                    />
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" checked={outro} onChange={e => setOutro(e.target.checked)} />
                    Tự động chèn Outro
                  </label>
                  {outro && (
                    <input 
                      type="text" placeholder="URL hoặc Media ID của Outro..."
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ml-7 shadow-sm"
                      value={outroMediaId} onChange={e => setOutroMediaId(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <SubtitleConfig value={subtitleConfig} onChange={setSubtitleConfig} />
            </div>
          </div>
          
          <div className="flex justify-end pt-6 border-t border-border gap-2">
            <Button variant="outline" onClick={() => setIsCreating(false)}>Huỷ</Button>
            <Button onClick={handleSave} disabled={!name} className="min-w-32">Lưu Preset</Button>
          </div>
        </div>
      )}
    </div>
  );
}
