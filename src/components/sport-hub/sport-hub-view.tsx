"use client";

import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Sparkles,
  Star,
  UserPlus,
  Users,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  Search,
  Flame,
  Award,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  Heart,
  Clock,
  X,
  UploadCloud,
  Download,
  Phone,
  ArrowRight,
  Layers,
  Radio,
} from "lucide-react";

interface KOL {
  id: string;
  name: string;
  sport: string[];
  tier: string;
  platform: string;
  geography: string;
  followers: number;
  avgViews: number;
  er: number;
  quotation: number;
  status: string;
  info: string;
  profileUrl: string;
}

interface Community {
  id: string;
  name: string;
  sport: string[];
  geography: string;
  members: number;
  platform: string;
  groupUrl: string;
  activityLevel: string;
  adminContact: string;
  pricePerPin: number;
  status: string;
}

interface Post {
  id: string;
  title: string;
  author: string;
  kolRecordIds: string[];
  platform: string;
  likes: number;
  comments: number;
  views: number;
  er: number;
  postUrl: string;
  viralGrade: string;
  status: string;
}

interface Report {
  id: string;
  title: string;
  kolName: string;
  kolRecordIds: string[];
  project: string;
  score: number;
  attitude: number;
  deadline: string;
  kpiCommit: number;
  kpiActual: number;
  kpiRate: number;
  notes: string;
  evaluator: string;
}

interface DashboardData {
  kpis: {
    totalKols: number;
    totalReach: number;
    avgScore: number;
    totalCommunities: number;
    totalCommunityMembers: number;
    totalPosts: number;
  };
  kols: KOL[];
  communities: Community[];
  posts: Post[];
  reports: Report[];
}

export function SportHubView({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Active KOL for 360° Dossier
  const [selectedKolId, setSelectedKolId] = useState<string>(
    initialData.kols[0]?.id || ""
  );

  // Search in 360° Section
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Multi-views Explorer Tab
  const [explorerTab, setExplorerTab] = useState<
    "all" | "sport" | "channel" | "region" | "tier" | "community" | "posts"
  >("all");

  // Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"kol" | "community">("kol");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  // Refresh from Lark Base
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lark/data");
      const result = await res.json();
      if (result.success) {
        setData({
          kpis: result.kpis,
          kols: result.kols,
          communities: result.communities,
          posts: result.posts,
          reports: result.reports,
        });
        toast.success("Đã đồng bộ dữ liệu mới nhất từ Lark Base!");
      } else {
        toast.error(result.error || "Lỗi khi đồng bộ dữ liệu");
      }
    } catch {
      toast.error("Không thể kết nối đến API");
    } finally {
      setLoading(false);
    }
  };

  // Selected KOL
  const currentKol = useMemo(() => {
    return data.kols.find((k) => k.id === selectedKolId) || data.kols[0];
  }, [data.kols, selectedKolId]);

  // Suggestions for search input
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return data.kols.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.sport.some((s) => s.toLowerCase().includes(q))
    );
  }, [data.kols, searchQuery]);

  // Related Posts for selected KOL
  const relatedPosts = useMemo(() => {
    if (!currentKol) return [];
    return data.posts.filter((p) => {
      const matchId = p.kolRecordIds && p.kolRecordIds.includes(currentKol.id);
      const matchAuthor =
        p.author &&
        (p.author.toLowerCase().includes(currentKol.name.toLowerCase()) ||
          currentKol.name.toLowerCase().includes(p.author.toLowerCase()));
      return matchId || matchAuthor;
    });
  }, [data.posts, currentKol]);

  // Related Reports for selected KOL
  const relatedReports = useMemo(() => {
    if (!currentKol) return [];
    return data.reports.filter((r) => {
      const matchId = r.kolRecordIds && r.kolRecordIds.includes(currentKol.id);
      const matchName =
        r.kolName &&
        (r.kolName.toLowerCase().includes(currentKol.name.toLowerCase()) ||
          currentKol.name.toLowerCase().includes(r.kolName.toLowerCase()));
      return matchId || matchName;
    });
  }, [data.reports, currentKol]);

  // Sorted/Filtered list for Multi-views Explorer
  const explorerKols = useMemo(() => {
    const list = [...data.kols];
    if (explorerTab === "sport") {
      return list.sort((a, b) =>
        (a.sport[0] || "").localeCompare(b.sport[0] || "")
      );
    }
    if (explorerTab === "region") {
      return list.sort((a, b) => a.geography.localeCompare(b.geography));
    }
    if (explorerTab === "channel") {
      return list.sort((a, b) => a.platform.localeCompare(b.platform));
    }
    if (explorerTab === "tier") {
      return list.sort((a, b) => b.followers - a.followers);
    }
    return list;
  }, [data.kols, explorerTab]);

  // File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws);
        setParsedRows(rows);
        toast.info(`Đã đọc ${rows.length} dòng dữ liệu từ file`);
      } catch (err: any) {
        toast.error("Lỗi khi đọc file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit Batch Upload
  const handleSubmitBatch = async () => {
    if (parsedRows.length === 0) {
      toast.warning("Vui lòng chọn file hợp lệ");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/lark/upload-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: uploadType, rows: parsedRows }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(result.message || "Nạp dữ liệu lên Lark thành công!");
        setIsUploadModalOpen(false);
        setParsedRows([]);
        setFileName("");
        handleRefresh();
      } else {
        toast.error(result.error || "Lỗi khi nạp dữ liệu");
      }
    } catch {
      toast.error("Lỗi kết nối tới server");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col font-sans">
      {/* ─── TOP NAVIGATION BAR ─── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white text-xl font-bold shadow-md shadow-blue-200">
                ⚡
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  SPORT INFLUENCER HUB
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Bảng Điều Khiển Tổng Hợp & Tra Cứu Toàn Cảnh 360°
                </p>
              </div>
            </div>

            {/* SYNC & LARK BASE LINK */}
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Đồng bộ Lark Base
              </span>

              <button
                onClick={handleRefresh}
                disabled={loading}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center space-x-1.5 transition active:scale-95"
                title="Làm mới từ Lark Base"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`}
                />
                <span className="hidden sm:inline">Làm mới</span>
              </button>

              <a
                href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center space-x-1.5 transition"
              >
                <span>Mở Lark Base Gốc</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ─── ACTION BUTTONS BAR (TRUNG TÂM HÀNH ĐỘNG) ─── */}
      <section className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                TRUNG TÂM HÀNH ĐỘNG (ACTION HUB)
              </h2>
              <p className="text-sm text-blue-200 mt-0.5">
                Thao tác nhanh cho người dùng: Gửi lệnh scout, nghiệm thu dự án, thêm hồ sơ mà không cần vào bảng thô.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tbl7JHIEfZNQRaD3&view=vew9DSEeqi"
                target="_blank"
                rel="noreferrer"
                className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-2 transition transform active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Form Scout Tự Động</span>
              </a>

              <a
                href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblz9lj9JCxMwJE3&view=vew5lEGugY"
                target="_blank"
                rel="noreferrer"
                className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-2 transition transform active:scale-95"
              >
                <Star className="w-3.5 h-3.5 fill-slate-900" />
                <span>Đánh Giá Nghiệm Thu</span>
              </a>

              <a
                href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tbllpqJ68WvvqHL4&view=vewKYvj9vc"
                target="_blank"
                rel="noreferrer"
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-lg border border-white/20 flex items-center space-x-2 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Thêm Mới KOL</span>
              </a>

              <a
                href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblMYU5kXPhKV6X5&view=vew0GaYFb5"
                target="_blank"
                rel="noreferrer"
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-lg border border-white/20 flex items-center space-x-2 transition"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Thêm Hội Nhóm CLB</span>
              </a>

              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-2 transition active:scale-95"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Upload File Excel</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MAIN CONTAINER ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* ─── 5 KPI SUMMARY CARDS ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
              👤
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng KOLs Trong Mạng</p>
              <h3 className="text-2xl font-black text-slate-900">
                {data.kpis.totalKols}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
              📢
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng Reach Ước Tính</p>
              <h3 className="text-2xl font-black text-slate-900">
                {(data.kpis.totalReach / 1000000).toFixed(2)}M+
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">
              👥
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Hội Nhóm / CLB</p>
              <h3 className="text-2xl font-black text-slate-900">
                {data.kpis.totalCommunities}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold">
              🔥
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Bài Viral Đã Scout</p>
              <h3 className="text-2xl font-black text-slate-900">
                {data.kpis.totalPosts}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4 col-span-2 sm:col-span-1">
            <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
              ⭐
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đánh Giá Uy Tín TB</p>
              <h3 className="text-2xl font-black text-amber-600">
                {data.kpis.avgScore} / 5.0
              </h3>
            </div>
          </div>
        </div>

        {/* ─── 360° SEARCH & DOSSIER SECTION (MATCHING media_1789749415999.png EXACTLY) ─── */}
        <section className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-10 opacity-70"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-100 text-blue-700">
                  TÍNH NĂNG CAO CẤP
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  TRA CỨU HỒ SƠ TOÀN CẢNH 360° (KOL DOSSIER)
                </h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Gõ hoặc chọn tên KOL để xem toàn bộ: Thông tin tổng quan, Performance kênh, Lịch sử nghiệm thu dự án & Bài viết viral.
              </p>
            </div>

            {/* SEARCH INPUT WITH AUTOCOMPLETE */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Nhập tên KOL (VD: Đỗ Kim Phúc, Hoàng Đăng Phan...)"
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />

              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto">
                  {searchSuggestions.map((k) => (
                    <div
                      key={k.id}
                      onClick={() => {
                        setSelectedKolId(k.id);
                        setSearchQuery(k.name);
                        setShowSuggestions(false);
                      }}
                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center space-x-2.5 border-b border-slate-100 last:border-0 transition"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                        {k.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{k.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {k.sport.join(", ")} | {(k.followers / 1000).toFixed(0)}k followers
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE KOL DOSSIER CARD CONTAINER (3 COLUMNS) */}
          {currentKol && (
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ─── COLUMN 1: PROFILE & BOOKING ─── */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center border-2 border-blue-500 p-0.5 shadow-sm shrink-0">
                      {currentKol.name.slice(0, 1)}
                    </div>
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                        {currentKol.tier}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 leading-tight mt-0.5">
                        {currentKol.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        {currentKol.sport.join(" / ") || "Thể thao"}
                      </p>
                    </div>
                  </div>

                  {currentKol.info ? (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                      {currentKol.info}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                      Hồ sơ vận động viên / nhà sáng tạo nội dung thể thao.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-[10px] text-slate-400 block">Khu Vực</span>
                      <span className="font-bold text-slate-800">
                        📍 {currentKol.geography}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-[10px] text-slate-400 block">Nền Tảng Chính</span>
                      <span className="font-bold text-blue-600">
                        🌐 {currentKol.platform}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-[10px] text-slate-400 block">Báo Giá Tham Khảo</span>
                      <span className="font-bold text-emerald-600">
                        💰{" "}
                        {currentKol.quotation > 0
                          ? `${currentKol.quotation.toLocaleString("vi-VN")} VNĐ`
                          : "Thỏa thuận"}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-[10px] text-slate-400 block">Trạng Thái CRM</span>
                      <span className="font-bold text-indigo-600">
                        🤝 {currentKol.status}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">
                      📞 Booking: <strong className="text-slate-800">Liên hệ quản lý</strong>
                    </span>
                    {currentKol.profileUrl && currentKol.profileUrl !== "#" && (
                      <a
                        href={currentKol.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-bold hover:underline text-xs flex items-center space-x-1"
                      >
                        <span>Xem Profile</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* ─── COLUMN 2: CHANNEL PERFORMANCE & VIRAL POSTS ─── */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span>Chỉ Số Hiệu Suất Kênh (Performance)</span>
                  </h4>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                      <span className="text-[10px] text-slate-500 block">Followers</span>
                      <span className="text-sm font-black text-blue-700">
                        {currentKol.followers.toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Avg Views</span>
                      <span className="text-sm font-black text-emerald-700">
                        {currentKol.avgViews > 0
                          ? currentKol.avgViews.toLocaleString("vi-VN")
                          : "—"}
                      </span>
                    </div>
                    <div className="bg-purple-50/60 p-2.5 rounded-lg border border-purple-100">
                      <span className="text-[10px] text-slate-500 block">Tỷ Lệ ER %</span>
                      <span className="text-sm font-black text-purple-700">
                        {currentKol.er > 0 ? `${currentKol.er}%` : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Flame className="w-3.5 h-3.5 text-rose-500" />
                        <span>Bài Viết & Reels Đã Cào Được</span>
                      </span>
                      <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Apify Live
                      </span>
                    </h5>

                    {relatedPosts.length > 0 ? (
                      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                        {relatedPosts.map((post) => (
                          <div
                            key={post.id}
                            className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center hover:bg-blue-50/40 transition"
                          >
                            <div className="space-y-1 pr-2">
                              <span className="font-semibold text-slate-800 line-clamp-1 block">
                                {post.title}
                              </span>
                              <div className="flex items-center space-x-3 text-[11px] text-slate-500">
                                <span>
                                  <Eye className="w-3 h-3 text-blue-500 inline mr-1" />
                                  {post.views.toLocaleString("vi-VN")} views
                                </span>
                                <span>
                                  <Heart className="w-3 h-3 text-rose-500 inline mr-1" />
                                  {post.likes.toLocaleString("vi-VN")} likes
                                </span>
                                <span className="bg-white px-1.5 py-0.5 rounded text-[10px] border border-slate-200 font-medium">
                                  {post.platform}
                                </span>
                              </div>
                            </div>
                            {post.postUrl && post.postUrl !== "#" && (
                              <a
                                href={post.postUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 shrink-0 flex items-center space-x-1 transition"
                              >
                                <span>Xem Bài</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-4 text-center bg-slate-50 rounded-lg border border-slate-100">
                        Chưa có bài viết viral nào được cào về cho KOL này.
                      </p>
                    )}
                  </div>
                </div>

                {/* ─── COLUMN 3: PROJECT HISTORY & PM EVALUATION ─── */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>Lịch Sử Dự Án & Nghiệm Thu</span>
                    </h4>
                    <a
                      href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblz9lj9JCxMwJE3&view=vew5lEGugY"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                    >
                      + Thêm Đánh Giá
                    </a>
                  </div>

                  {relatedReports.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {relatedReports.map((r) => (
                        <div
                          key={r.id}
                          className="bg-white p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5 hover:border-amber-300 transition"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800 text-sm">
                              {r.project || r.title}
                            </span>
                            <span className="text-amber-500 font-bold text-sm">
                              ⭐ {r.score}/5.0
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-slate-500 text-[11px] pt-1">
                            <div>
                              🎯 Cam kết:{" "}
                              <strong className="text-slate-700">
                                {r.kpiCommit > 0
                                  ? `${r.kpiCommit.toLocaleString("vi-VN")} Views`
                                  : "Đạt KPI"}
                              </strong>
                            </div>
                            <div>
                              🚀 Thực tế:{" "}
                              <strong className="text-emerald-600">
                                {r.kpiActual > 0
                                  ? `${r.kpiActual.toLocaleString("vi-VN")} Views`
                                  : "100% KPI"}
                              </strong>
                            </div>
                            <div>
                              ⏰ Tiến độ:{" "}
                              <strong className="text-blue-600">{r.deadline}</strong>
                            </div>
                            <div>
                              👤 PM:{" "}
                              <strong className="text-slate-700">{r.evaluator}</strong>
                            </div>
                          </div>

                          {r.notes && (
                            <div className="bg-slate-50 p-2 rounded text-slate-600 italic text-[11px] mt-1 border-l-2 border-amber-400">
                              "{r.notes}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-6 text-center bg-slate-50 rounded-lg border border-slate-100">
                      Chưa có lịch sử dự án trước đây. KOL mới trong mạng lưới.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ─── DYNAMIC MULTI-VIEWS SWITCHER (MATCHING portal/index.html EXACTLY) ─── */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>GÓC NHÌN ĐA CHIỀU (MULTI-VIEWS EXPLORER)</span>
            </h2>

            {/* TABS SWITCHER */}
            <div className="flex flex-wrap gap-1 bg-slate-200/60 p-1 rounded-xl text-xs font-semibold text-slate-600">
              <button
                onClick={() => setExplorerTab("all")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "all"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Tất Cả KOLs ({data.kols.length})
              </button>
              <button
                onClick={() => setExplorerTab("sport")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "sport"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Theo Bộ Môn
              </button>
              <button
                onClick={() => setExplorerTab("channel")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "channel"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Theo Kênh (Platform)
              </button>
              <button
                onClick={() => setExplorerTab("region")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "region"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Theo Vùng Miền
              </button>
              <button
                onClick={() => setExplorerTab("tier")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "tier"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Theo Phân Khúc (Tier)
              </button>
              <button
                onClick={() => setExplorerTab("community")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "community"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Hội Nhóm / CLB ({data.communities.length})
              </button>
              <button
                onClick={() => setExplorerTab("posts")}
                className={`px-3.5 py-2 rounded-lg transition ${
                  explorerTab === "posts"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "hover:text-slate-900"
                }`}
              >
                Bài Viết Viral ({data.posts.length})
              </button>
            </div>
          </div>

          {/* VIEW CONTENT CONTAINER */}
          {explorerTab === "community" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {data.communities.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-purple-400 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg shrink-0">
                        👥
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                          {c.name}
                        </h4>
                        <span className="text-[11px] font-semibold text-purple-600">
                          {c.sport.join(", ") || "Thể thao"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Thành viên:</span>
                        <span className="font-bold text-slate-800">
                          {c.members.toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Khu vực:</span>
                        <span className="font-semibold text-slate-700">{c.geography}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Nền tảng:</span>
                        <span className="font-semibold text-indigo-600">{c.platform}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ghim bài:</span>
                        <span className="font-bold text-amber-700">
                          {c.pricePerPin > 0
                            ? `${c.pricePerPin.toLocaleString("vi-VN")}₫`
                            : "Thỏa thuận"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {c.groupUrl && c.groupUrl !== "#" && (
                    <a
                      href={c.groupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 w-full py-1.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white transition text-center block"
                    >
                      Truy Cập Nhóm ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : explorerTab === "posts" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {data.posts.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-rose-400 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100">
                        🔥 {p.viralGrade}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {p.platform}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                      {p.title}
                    </h4>

                    <p className="text-[11px] text-slate-500 mt-1">
                      Tác giả: <strong className="text-slate-700">{p.author}</strong>
                    </p>

                    <div className="grid grid-cols-3 gap-1 text-center text-xs p-2 bg-slate-50 rounded-lg mt-2.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Views</span>
                        <span className="font-bold text-slate-800">
                          {(p.views / 1000).toFixed(0)}k
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Likes</span>
                        <span className="font-bold text-slate-800">
                          {(p.likes / 1000).toFixed(0)}k
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">ER</span>
                        <span className="font-bold text-emerald-600">{p.er}%</span>
                      </div>
                    </div>
                  </div>

                  {p.postUrl && p.postUrl !== "#" && (
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 w-full py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition text-center block"
                    >
                      Xem Bài Viết Gốc ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {explorerKols.map((k) => (
                <div
                  key={k.id}
                  onClick={() => {
                    setSelectedKolId(k.id);
                    setSearchQuery(k.name);
                    window.scrollTo({ top: 220, behavior: "smooth" });
                  }}
                  className={`bg-white rounded-xl border p-4 shadow-sm hover:border-blue-400 cursor-pointer transition flex flex-col justify-between ${
                    currentKol?.id === k.id
                      ? "ring-2 ring-blue-500 border-blue-500"
                      : "border-slate-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-lg flex items-center justify-center border border-slate-200 shrink-0">
                        {k.name.slice(0, 1)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 hover:text-blue-600 transition leading-tight">
                          {k.name}
                        </h4>
                        <span className="text-[11px] font-semibold text-blue-600">
                          {k.sport.join(", ") || "Thể thao"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Followers:</span>
                        <span className="font-bold text-slate-800">
                          {k.followers.toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Khu vực:</span>
                        <span className="font-semibold text-slate-700">{k.geography}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Kênh:</span>
                        <span className="font-semibold text-indigo-600">{k.platform}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Phân khúc:</span>
                        <span className="font-bold text-amber-600">{k.tier}</span>
                      </div>
                    </div>
                  </div>

                  <button className="mt-4 w-full py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition">
                    Bấm Tra Cứu 360°
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ─── UPLOAD MODAL (BATCH IMPORT TO LARK BASE) ─── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>Thêm KOL & Community Bằng Upload File Excel / CSV</span>
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TARGET SELECTOR */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                1. Chọn đối tượng muốn thêm dữ liệu:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  onClick={() => {
                    setUploadType("kol");
                    setParsedRows([]);
                    setFileName("");
                  }}
                  className={`flex items-center space-x-2 p-3 border rounded-xl cursor-pointer transition ${
                    uploadType === "kol"
                      ? "border-blue-200 bg-blue-50/50 text-blue-900 font-bold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="upload-type"
                    checked={uploadType === "kol"}
                    onChange={() => {}}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold">👤 Danh Bạ KOLs Thể Thao</span>
                </label>

                <label
                  onClick={() => {
                    setUploadType("community");
                    setParsedRows([]);
                    setFileName("");
                  }}
                  className={`flex items-center space-x-2 p-3 border rounded-xl cursor-pointer transition ${
                    uploadType === "community"
                      ? "border-emerald-200 bg-emerald-50/50 text-emerald-900 font-bold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="upload-type"
                    checked={uploadType === "community"}
                    onChange={() => {}}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold">👥 Hội Nhóm & CLB Thể Thao</span>
                </label>
              </div>
            </div>

            {/* TEMPLATE DOWNLOAD */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  Chưa có file dữ liệu đúng mẫu?
                </h4>
                <p className="text-[11px] text-slate-500">
                  Tải file mẫu Excel chuẩn để điền thông tin nhanh nhất
                </p>
              </div>
              <div className="flex space-x-2">
                <a
                  href={
                    uploadType === "kol"
                      ? "/templates/Mau_Import_KOLs.xlsx"
                      : "/templates/Mau_Import_Communities.xlsx"
                  }
                  download
                  className="text-xs font-bold px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 text-blue-600 rounded-lg shadow-sm flex items-center space-x-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Mẫu Excel (.xlsx)</span>
                </a>
              </div>
            </div>

            {/* DRAG & DROP AREA */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                2. Tải lên tệp (.xlsx hoặc .csv):
              </label>
              <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/30 transition flex flex-col items-center justify-center">
                <UploadCloud className="w-8 h-8 text-blue-500 mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  {fileName ? (
                    <strong className="text-blue-600">{fileName}</strong>
                  ) : (
                    <>
                      Kéo thả file .xlsx, .csv vào đây hoặc{" "}
                      <span className="text-blue-600 underline">bấm chọn file</span>
                    </>
                  )}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Hỗ trợ tối đa 500 dòng / lần nhập. Dữ liệu sẽ tự động đồng bộ lên Lark Base.
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {/* PREVIEW SECTION */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Đã đọc thành công {parsedRows.length} dòng dữ liệu</span>
                  </span>
                  <span className="text-slate-400 text-[11px]">{fileName}</span>
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg text-[11px] bg-slate-50">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0">
                      <tr>
                        {Object.keys(parsedRows[0] || {})
                          .slice(0, 5)
                          .map((k) => (
                            <th key={k} className="py-1.5 px-3 whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 4).map((row, idx) => (
                        <tr key={idx}>
                          {Object.values(row)
                            .slice(0, 5)
                            .map((val: any, vIdx) => (
                              <td
                                key={vIdx}
                                className="py-1 px-3 whitespace-nowrap text-slate-700 truncate max-w-xs"
                              >
                                {String(val)}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={parsedRows.length === 0 || uploading}
                onClick={handleSubmitBatch}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center space-x-2 disabled:opacity-50 active:scale-95 shadow-md"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang nạp lên Lark Base...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Xác Nhận & Đẩy {parsedRows.length} Bản Ghi Lên Lark</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
