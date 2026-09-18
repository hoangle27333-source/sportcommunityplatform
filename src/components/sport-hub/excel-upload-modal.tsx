"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  X,
  Download,
  UserPlus,
  Users,
  UploadCloud,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: "kol" | "community";
}

export function ExcelUploadModal({
  isOpen,
  onClose,
  onSuccess,
  defaultType = "kol",
}: ExcelUploadModalProps) {
  const [uploadType, setUploadType] = useState<"kol" | "community">(defaultType);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

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
        toast.info(`Parsed ${rows.length} rows from file`);
      } catch (err: any) {
        toast.error("Error parsing spreadsheet: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmitBatch = async () => {
    if (parsedRows.length === 0) {
      toast.warning("Please upload a valid Excel or CSV file first.");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/sport-hub/upload-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: uploadType, rows: parsedRows }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(result.message || "Batch successfully imported into Supabase!");
        setParsedRows([]);
        setFileName("");
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Batch import failed");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Batch Import Data to Supabase
              </h3>
              <p className="text-xs text-slate-500">
                Upload Excel (.xlsx, .xls) or CSV files directly into master tables.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Choose Table Type & Templates */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Select Destination Table & Template
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
                <span>Template .XLSX</span>
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
                <span>Template .CSV</span>
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
              className={`p-3 rounded-xl border text-left transition flex items-center space-x-3 cursor-pointer ${
                uploadType === "kol"
                  ? "border-blue-600 bg-blue-50/50 text-blue-900 font-bold"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <UserPlus className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs font-bold">KOLs & Creators Table</p>
                <p className="text-[10px] text-slate-500 font-normal">
                  Followers, Avg Views, ER%, Quotation...
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
              className={`p-3 rounded-xl border text-left transition flex items-center space-x-3 cursor-pointer ${
                uploadType === "community"
                  ? "border-blue-600 bg-blue-50/50 text-blue-900 font-bold"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <Users className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <p className="text-xs font-bold">Communities & Clubs Table</p>
                <p className="text-[10px] text-slate-500 font-normal">
                  Member count, Admins, Price per pin...
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Drag and drop */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            2. Choose File to Upload
          </label>
          <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition">
            <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-xs font-bold text-slate-700">
              {fileName ? fileName : "Click or drag spreadsheet file here"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Supports .xlsx, .xls, .csv up to 10MB
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
                Data Preview ({parsedRows.length} rows):
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold">
                ✓ Columns successfully parsed
              </span>
            </div>
            <div className="max-h-36 overflow-auto border border-slate-200 rounded-lg text-[11px]">
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
                  {parsedRows.slice(0, 3).map((row, idx) => (
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

        {/* Actions Footer */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedRows.length === 0 || uploading}
            onClick={handleSubmitBatch}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-1.5 disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Importing to Supabase...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Import {parsedRows.length} Rows</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
