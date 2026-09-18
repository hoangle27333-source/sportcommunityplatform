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
  Filter,
  Flame,
  Award,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  Heart,
  MessageCircle,
  Clock,
  X,
  UploadCloud,
  Download,
  Share2,
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

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "360" | "kols" | "communities" | "posts" | "reports"
  >("360");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSport, setSelectedSport] = useState("all");
  const [selectedTier, setSelectedTier] = useState("all");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [selectedGeo, setSelectedGeo] = useState("all");

  // Selected KOL for 360 View
  const [selectedKolId, setSelectedKolId] = useState<string>(
    initialData.kols[0]?.id || ""
  );

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"kol" | "community">("kol");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  // Refresh data from Lark API
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

  // Filtered KOLs
  const filteredKols = useMemo(() => {
    return data.kols.filter((k) => {
      const matchSearch =
        !searchQuery ||
        k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        k.info.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSport =
        selectedSport === "all" ||
        k.sport.some((s) => s.toLowerCase().includes(selectedSport.toLowerCase()));
      const matchTier =
        selectedTier === "all" ||
        k.tier.toLowerCase().includes(selectedTier.toLowerCase());
      const matchPlatform =
        selectedPlatform === "all" ||
        k.platform.toLowerCase().includes(selectedPlatform.toLowerCase());
      const matchGeo =
        selectedGeo === "all" ||
        k.geography.toLowerCase().includes(selectedGeo.toLowerCase());

      return matchSearch && matchSport && matchTier && matchPlatform && matchGeo;
    });
  }, [data.kols, searchQuery, selectedSport, selectedTier, selectedPlatform, selectedGeo]);

  // Selected KOL Object
  const currentKol = useMemo(() => {
    return (
      data.kols.find((k) => k.id === selectedKolId) ||
      filteredKols[0] ||
      data.kols[0]
    );
  }, [data.kols, selectedKolId, filteredKols]);

  // Related Posts for Selected KOL
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

  // Related Reports for Selected KOL
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

  // Submit Upload to API
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ─── TOP NAVIGATION BAR ─── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-md shadow-blue-500/20">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                  SPORT INFLUENCER HUB
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                  Vercel Live
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Bảng Điều Khiển Tổng Hợp & Tra Cứu Toàn Cảnh 360°
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Lark Base Live Sync
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition disabled:opacity-50"
              title="Làm mới dữ liệu từ Lark Base"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            <a
              href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 transition"
            >
              <span>Lark Base Gốc</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ─── ACTION BUTTONS BAR (TRUNG TÂM HÀNH ĐỘNG) ─── */}
      <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white py-6 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-mono font-medium border border-blue-400/30">
                ACTION HUB
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                TRUNG TÂM THAO TÁC NHANH
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Gửi lệnh scout, chấm điểm nghiệm thu hoặc upload file Excel trực tiếp vào Lark Base mà không cần mở bảng thô.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tbl7JHIEfZNQRaD3&view=vew9DSEeqi"
              target="_blank"
              rel="noreferrer"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-1.5 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Form Scout Tự Động</span>
            </a>

            <a
              href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblz9lj9JCxMwJE3&view=vew5lEGugY"
              target="_blank"
              rel="noreferrer"
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-1.5 transition active:scale-95"
            >
              <Star className="w-3.5 h-3.5 fill-slate-950" />
              <span>Form Nghiệm Thu</span>
            </a>

            <a
              href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tbllpqJ68WvvqHL4&view=vewKYvj9vc"
              target="_blank"
              rel="noreferrer"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-2 rounded-lg border border-white/20 flex items-center space-x-1.5 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Thêm KOL</span>
            </a>

            <a
              href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblMYU5kXPhKV6X5&view=vew0GaYFb5"
              target="_blank"
              rel="noreferrer"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-2 rounded-lg border border-white/20 flex items-center space-x-1.5 transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Thêm CLB</span>
            </a>

            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-md flex items-center space-x-1.5 transition active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload File Excel</span>
            </button>
          </div>
        </div>
      </section>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* ─── KPI STATS SUMMARY CARDS ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
              👤
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng KOLs Trong Mạng</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalKols}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
              🚀
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng Lượng Reach</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {(data.kpis.totalReach / 1000000).toFixed(2)}M
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
              ⭐
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Điểm Uy Tín Hợp Tác</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.avgScore}{" "}
                <span className="text-xs font-semibold text-slate-400">/ 5.0</span>
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">
              👥
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Hội Nhóm & CLB</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalCommunities}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5 col-span-2 sm:col-span-1">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold">
              🔥
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Bài Viết Hot Trend</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalPosts}
              </h3>
            </div>
          </div>
        </div>

        {/* ─── SLICERS & FILTER CONTROLS ─── */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                BỘ LỌC ĐA CHIỀU (DASHBOARD SLICERS)
              </h3>
              <span className="text-xs text-slate-400">
                ({filteredKols.length} kết quả phù hợp)
              </span>
            </div>

            {/* Quick Tab Switch */}
            <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveTab("360")}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === "360"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🎯 Tra Cứu 360° (3 Cột)
              </button>
              <button
                onClick={() => setActiveTab("kols")}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === "kols"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                👤 Danh Sách KOLs
              </button>
              <button
                onClick={() => setActiveTab("communities")}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === "communities"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                👥 Nhóm & CLB ({data.communities.length})
              </button>
              <button
                onClick={() => setActiveTab("posts")}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === "posts"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🎬 Kho Bài Hot ({data.posts.length})
              </button>
              <button
                onClick={() => setActiveTab("reports")}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === "reports"
                    ? "bg-white text-blue-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ⭐ Nghiệm Thu ({data.reports.length})
              </button>
            </div>
          </div>

          {/* Filter Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên KOL, Bio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
            </div>

            {/* Sport Filter */}
            <div>
              <select
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 font-medium"
              >
                <option value="all">🏅 Tất Cả Bộ Môn</option>
                <option value="Pickleball">Pickleball</option>
                <option value="Bóng đá">Bóng đá</option>
                <option value="Chạy bộ">Chạy bộ / Marathon</option>
                <option value="Gym">Gym & Fitness</option>
                <option value="Tennis">Tennis</option>
                <option value="Cầu lông">Cầu lông</option>
                <option value="Golf">Golf</option>
              </select>
            </div>

            {/* Tier Filter */}
            <div>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 font-medium"
              >
                <option value="all">📊 Tất Cả Phân Khúc (Tier)</option>
                <option value="Mega">Mega (&gt; 200k)</option>
                <option value="Macro">Macro (50k - 200k)</option>
                <option value="Micro">Micro (10k - 50k)</option>
                <option value="Nano">Nano (&lt; 10k)</option>
              </select>
            </div>

            {/* Platform Filter */}
            <div>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 font-medium"
              >
                <option value="all">🌐 Tất Cả Nền Tảng</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="Threads">Threads</option>
              </select>
            </div>

            {/* Geography Filter */}
            <div>
              <select
                value={selectedGeo}
                onChange={(e) => setSelectedGeo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 font-medium"
              >
                <option value="all">📍 Khu Vực</option>
                <option value="Hà Nội">Hà Nội</option>
                <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
                <option value="Toàn quốc">Toàn quốc</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── TAB 1: 3-COLUMN 360° DOSSIER VIEW ─── */}
        {activeTab === "360" && (
          <div className="space-y-4">
            {/* Quick KOL Selector Chips */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
              <span className="text-xs font-bold text-slate-500 shrink-0">
                Chọn KOL Tra Cứu:
              </span>
              {filteredKols.map((kol) => (
                <button
                  key={kol.id}
                  onClick={() => setSelectedKolId(kol.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
                    currentKol?.id === kol.id
                      ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>{kol.name}</span>
                  <span className="text-[10px] opacity-75 font-normal">
                    ({(kol.followers / 1000).toFixed(0)}k)
                  </span>
                </button>
              ))}
            </div>

            {currentKol ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* ─── COLUMN 1: KOL PROFILE & QUOTATION ─── */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">
                      Cột 1: Thông Tin & Báo Giá
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {currentKol.status}
                    </span>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                      {currentKol.name.slice(0, 1)}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 leading-tight">
                        {currentKol.name}
                      </h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">
                          {currentKol.tier}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                          {currentKol.platform}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                          📍 {currentKol.geography}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sport Badges */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                      Bộ Môn Thể Thao
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentKol.sport.map((s, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold"
                        >
                          🏅 {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium">Followers</p>
                      <p className="text-sm font-black text-slate-900">
                        {(currentKol.followers / 1000).toFixed(0)}k
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium">Avg Views</p>
                      <p className="text-sm font-black text-slate-900">
                        {currentKol.avgViews > 0
                          ? `${(currentKol.avgViews / 1000).toFixed(0)}k`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium">ER %</p>
                      <p className="text-sm font-black text-emerald-600">
                        {currentKol.er > 0 ? `${currentKol.er}%` : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Quotation */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                    <p className="text-xs font-semibold text-amber-800">
                      Báo Giá Booking Tham Khảo
                    </p>
                    <p className="text-xl font-black text-amber-900 mt-0.5">
                      {currentKol.quotation > 0
                        ? `${currentKol.quotation.toLocaleString("vi-VN")} VNĐ`
                        : "Liên hệ thỏa thuận"}
                    </p>
                  </div>

                  {/* Bio & Link */}
                  {currentKol.info && (
                    <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="font-semibold text-slate-800 mb-1">Giới thiệu / Bio:</p>
                      {currentKol.info}
                    </div>
                  )}

                  {currentKol.profileUrl && currentKol.profileUrl !== "#" && (
                    <a
                      href={currentKol.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center space-x-1.5 transition"
                    >
                      <span>Xem Profile Mạng Xã Hội</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {/* ─── COLUMN 2: VIRAL REELS & POSTS SCOUTED ─── */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-purple-600 tracking-wider uppercase flex items-center space-x-1.5">
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      <span>Cột 2: Bài Viết & Reels Hot Đã Scout</span>
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {relatedPosts.length} bài
                    </span>
                  </div>

                  {relatedPosts.length > 0 ? (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                      {relatedPosts.map((post) => (
                        <div
                          key={post.id}
                          className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-purple-300 hover:shadow-md transition space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                              {post.platform}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100 flex items-center space-x-1">
                              <Flame className="w-3 h-3" />
                              <span>{post.viralGrade}</span>
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                            {post.title}
                          </h4>

                          <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-100 text-slate-600">
                            <div className="flex items-center space-x-1">
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>{(post.views / 1000).toFixed(0)}k view</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Heart className="w-3 h-3 text-slate-400" />
                              <span>{(post.likes / 1000).toFixed(0)}k like</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <TrendingUp className="w-3 h-3 text-emerald-500" />
                              <span className="font-bold text-emerald-600">
                                {post.er}% ER
                              </span>
                            </div>
                          </div>

                          {post.postUrl && post.postUrl !== "#" && (
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800 pt-1"
                            >
                              <span>Mở bài viết gốc</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">
                          Chưa có bài viết scout cho KOL này
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Bấm nút bên dưới để gửi lệnh bot cào bài viết tự động
                        </p>
                      </div>
                      <a
                        href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tbl7JHIEfZNQRaD3&view=vew9DSEeqi"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Gửi Lệnh Scout Bài</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* ─── COLUMN 3: PROJECT HISTORY & EVALUATION ─── */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-amber-600 tracking-wider uppercase flex items-center space-x-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>Cột 3: Lịch Sử Nghiệm Thu & Đánh Giá PM</span>
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {relatedReports.length} báo cáo
                    </span>
                  </div>

                  {relatedReports.length > 0 ? (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                      {relatedReports.map((report) => (
                        <div
                          key={report.id}
                          className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-300 hover:shadow-md transition space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 leading-snug">
                                {report.project || report.title}
                              </h4>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Đánh giá bởi: {report.evaluator}
                              </p>
                            </div>
                            <div className="flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              <span className="text-xs font-black text-amber-900">
                                {report.score} / 5
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] p-2 bg-white rounded-lg border border-slate-100">
                            <div>
                              <span className="text-slate-400">Thái độ hợp tác:</span>{" "}
                              <span className="font-bold text-slate-800">
                                {report.attitude}/5 ⭐
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">Tiến độ:</span>{" "}
                              <span className="font-bold text-emerald-600">
                                {report.deadline}
                              </span>
                            </div>
                          </div>

                          {report.notes && (
                            <div className="text-[11px] text-slate-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/60 leading-relaxed">
                              <span className="font-bold text-amber-900">
                                📝 Nhận xét của PM:
                              </span>{" "}
                              {report.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <Star className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">
                          Chưa có lịch sử nghiệm thu cho KOL này
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tạo phiếu đánh giá sau mỗi chiến dịch để lưu hồ sơ 360°
                        </p>
                      </div>
                      <a
                        href="https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe?table=tblz9lj9JCxMwJE3&view=vew5lEGugY"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition shadow-sm"
                      >
                        <Star className="w-3.5 h-3.5 fill-slate-950" />
                        <span>Tạo Phiếu Nghiệm Thu</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
                <p className="text-sm font-semibold text-slate-500">
                  Không tìm thấy KOL phù hợp với bộ lọc. Hãy điều chỉnh bộ lọc ở trên.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: FULL KOLS DIRECTORY TABLE / CARDS ─── */}
        {activeTab === "kols" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DANH SÁCH HỒ SƠ KOLS ({filteredKols.length} hồ sơ)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Tên KOL / Kênh</th>
                    <th className="py-3 px-4">Bộ Môn</th>
                    <th className="py-3 px-4">Phân Khúc</th>
                    <th className="py-3 px-4">Followers</th>
                    <th className="py-3 px-4">ER %</th>
                    <th className="py-3 px-4">Báo Giá Tham Khảo</th>
                    <th className="py-3 px-4">Khu Vực</th>
                    <th className="py-3 px-4 text-right">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredKols.map((kol) => (
                    <tr key={kol.id} className="hover:bg-blue-50/50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {kol.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {kol.sport.join(", ") || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                          {kol.tier}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold">
                        {(kol.followers / 1000).toFixed(0)}k
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-600">
                        {kol.er > 0 ? `${kol.er}%` : "—"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-amber-700">
                        {kol.quotation > 0
                          ? `${kol.quotation.toLocaleString("vi-VN")}₫`
                          : "Thỏa thuận"}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{kol.geography}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedKolId(kol.id);
                            setActiveTab("360");
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[11px] hover:bg-blue-500 transition shadow-sm"
                        >
                          Xem 360°
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB 3: COMMUNITIES DIRECTORY ─── */}
        {activeTab === "communities" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.communities.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-purple-300 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">
                    👥
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {c.activityLevel}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    {c.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.platform} · {c.geography}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {c.sport.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium"
                    >
                      🏅 {s}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Thành viên:</span>
                    <span className="font-bold text-slate-900">
                      {c.members.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Ghim bài / tháng:</span>
                    <span className="font-bold text-amber-800">
                      {c.pricePerPin > 0
                        ? `${c.pricePerPin.toLocaleString("vi-VN")}₫`
                        : "Thỏa thuận"}
                    </span>
                  </div>
                </div>

                {c.adminContact && (
                  <p className="text-[11px] text-slate-500 truncate">
                    Liên hệ: <span className="text-slate-800 font-medium">{c.adminContact}</span>
                  </p>
                )}

                {c.groupUrl && c.groupUrl !== "#" && (
                  <a
                    href={c.groupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center space-x-1.5 transition"
                  >
                    <span>Truy cập Nhóm / CLB</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── TAB 4: VIRAL POSTS FEED ─── */}
        {activeTab === "posts" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.posts.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 hover:border-purple-300 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                    {p.platform}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                    🔥 {p.viralGrade}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                    {p.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    Tác giả: <span className="text-slate-800 font-bold">{p.author}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Views</span>
                    <span className="font-bold text-slate-900">
                      {(p.views / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Likes</span>
                    <span className="font-bold text-slate-900">
                      {(p.likes / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">ER</span>
                    <span className="font-bold text-emerald-600">{p.er}%</span>
                  </div>
                </div>

                {p.postUrl && p.postUrl !== "#" && (
                  <a
                    href={p.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1 transition"
                  >
                    <span>Mở bài viết</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── TAB 5: REPORTS & EVALUATIONS ─── */}
        {activeTab === "reports" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                NHẬT KÝ ĐÁNH GIÁ & NGHIỆM THU DỰ ÁN ({data.reports.length} biên bản)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Tên Dự Án</th>
                    <th className="py-3 px-4">KOL Nghiệm Thu</th>
                    <th className="py-3 px-4">Điểm Đánh Giá</th>
                    <th className="py-3 px-4">Thái Độ</th>
                    <th className="py-3 px-4">Tiến Độ</th>
                    <th className="py-3 px-4">Ghi Chú của PM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.reports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {r.project || r.title}
                      </td>
                      <td className="py-3 px-4 font-semibold text-blue-700">
                        {r.kolName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200">
                          ⭐ {r.score}/5
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {r.attitude}/5 ⭐
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                          {r.deadline}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL UPLOAD FILE EXCEL / CSV BATCH ─── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Nạp Dữ Liệu Hàng Loạt Vào Lark Base
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ file Excel (.xlsx, .xls) và CSV. Dữ liệu nạp thẳng vào bảng trên Lark.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Choose Type & Download Template */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase">
                  1. Chọn Bảng Đích & Tải File Mẫu
                </label>
                <div className="flex items-center space-x-2">
                  <a
                    href={
                      uploadType === "kol"
                        ? "/templates/Mau_Import_KOLs.xlsx"
                        : "/templates/Mau_Import_Communities.xlsx"
                    }
                    download
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded border border-blue-200"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải mẫu .XLSX</span>
                  </a>
                  <a
                    href={
                      uploadType === "kol"
                        ? "/templates/Mau_Import_KOLs.csv"
                        : "/templates/Mau_Import_Communities.csv"
                    }
                    download
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 px-2.5 py-1 rounded"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải mẫu .CSV</span>
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUploadType("kol");
                    setParsedRows([]);
                    setFileName("");
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center space-x-3 ${
                    uploadType === "kol"
                      ? "border-blue-600 bg-blue-50/50 text-blue-900 font-bold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-xs font-bold">Thêm Hồ Sơ KOLs</p>
                    <p className="text-[10px] text-slate-500 font-normal">
                      Bảng List KOLs (Followers, ER%, Giá...)
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUploadType("community");
                    setParsedRows([]);
                    setFileName("");
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-center space-x-3 ${
                    uploadType === "community"
                      ? "border-blue-600 bg-blue-50/50 text-blue-900 font-bold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <Users className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="text-xs font-bold">Thêm Hội Nhóm / CLB</p>
                    <p className="text-[10px] text-slate-500 font-normal">
                      Bảng List Community (Thành viên, Admin...)
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase">
                2. Tải Lên Tệp Excel / CSV
              </label>
              <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {fileName ? fileName : "Nhấp hoặc kéo thả file vào đây"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Định dạng .xlsx, .xls, .csv dung lượng tối đa 10MB
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Step 3: Preview */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">
                    Xem Trước Dữ Liệu ({parsedRows.length} dòng):
                  </span>
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    ✓ Đã nhận diện cột thành công
                  </span>
                </div>
                <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg text-[11px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0">
                      <tr>
                        {Object.keys(parsedRows[0] || {})
                          .slice(0, 5)
                          .map((key) => (
                            <th key={key} className="py-1.5 px-3 whitespace-nowrap">
                              {key}
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

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={parsedRows.length === 0 || uploading}
                onClick={handleSubmitBatch}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-1.5 disabled:opacity-50 active:scale-95"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang nạp lên Lark Base...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Nạp {parsedRows.length} Bản Ghi Lên Lark</span>
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
