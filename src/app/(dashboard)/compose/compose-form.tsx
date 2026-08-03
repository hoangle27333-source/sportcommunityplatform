"use client";

import { useEffect, useState } from "react";

/**
 * ComposeForm — client-side wizard state machine (SPEC §7, §5).
 *
 * Single page, no route changes between steps:
 *   1. Brief (+ campaign optional) -> POST /api/content/caption -> variants
 *   2. Pick a caption variant (editable)
 *   3. Optional: pick a banner template + fill data -> POST /api/content/banner
 *   4. Pick target channels (social_accounts)
 *   5. Submit: POST /api/posts (draft) -> PATCH .../schedule or POST .../publish-now
 *
 * Every step's data lives in this component's state; nothing is persisted
 * until the final submit, so the user can regenerate captions/banners freely.
 */

interface CaptionVariant {
  caption: string;
  hashtags: string[];
  cta?: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  status: string;
}

interface MediaAsset {
  id: string;
  url: string;
  type: string;
}

type Step = "brief" | "caption" | "media" | "channels" | "done";

export function ComposeForm() {
  const [step, setStep] = useState<Step>("brief");
  const [error, setError] = useState<string | null>(null);

  // Step 1: brief
  const [brief, setBrief] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [platform, setPlatform] = useState<"facebook" | "instagram">(
    "facebook",
  );
  const [generatingCaption, setGeneratingCaption] = useState(false);

  // Step 2: caption
  const [variants, setVariants] = useState<CaptionVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [cta, setCta] = useState("");

  // Step 3: banner (optional)
  const [templates, setTemplates] = useState<string[]>([]);
  const [wantBanner, setWantBanner] = useState(false);
  const [template, setTemplate] = useState("announcement");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [generatingBanner, setGeneratingBanner] = useState(false);
  const [banner, setBanner] = useState<MediaAsset | null>(null);

  // Step 4: channels
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(),
  );

  // Step 5: submit
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [runAt, setRunAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultPostId, setResultPostId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .catch(() => {});
    fetch("/api/content/banner")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => setChannels(d.channels ?? []))
      .catch(() => {});
  }, []);

  async function generateCaption() {
    setError(null);
    setGeneratingCaption(true);
    try {
      const res = await fetch("/api/content/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          platform,
          campaignId: campaignId || undefined,
          variants: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sinh caption thất bại");
      const v: CaptionVariant[] = data.variants ?? [];
      if (v.length === 0) throw new Error("AI không trả về caption nào.");
      setVariants(v);
      applyVariant(v[0]);
      setSelectedVariant(0);
      setStep("caption");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingCaption(false);
    }
  }

  function applyVariant(v: CaptionVariant) {
    setCaption(v.caption);
    setHashtags(v.hashtags.join(" "));
    setCta(v.cta ?? "");
  }

  async function generateBanner() {
    setError(null);
    setGeneratingBanner(true);
    try {
      const res = await fetch("/api/content/banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          data: { title: bannerTitle || caption.slice(0, 60), subtitle: bannerSubtitle },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sinh banner thất bại");
      setBanner(data.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingBanner(false);
    }
  }

  function toggleChannel(id: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (selectedChannels.size === 0) {
      setError("Chọn ít nhất 1 kênh để đăng.");
      return;
    }
    if (mode === "schedule" && !runAt) {
      setError("Chọn thời gian lên lịch.");
      return;
    }
    setSubmitting(true);
    try {
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignId || undefined,
          caption,
          hashtags: hashtags.split(/\s+/).filter(Boolean).map((h) => h.replace(/^#+/, "")),
          cta: cta || undefined,
          primaryPlatform: platform,
          targetAccountIds: Array.from(selectedChannels),
          mediaIds: banner ? [banner.id] : undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error ?? "Tạo bài viết thất bại");
      const postId: string = created.id;

      const actionRes =
        mode === "now"
          ? await fetch(`/api/posts/${postId}/publish-now`, { method: "POST" })
          : await fetch(`/api/posts/${postId}/schedule`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runAt: new Date(runAt).toISOString() }),
            });
      const actionData = await actionRes.json();
      if (!actionRes.ok) throw new Error(actionData.error ?? "Lên lịch/đăng thất bại");

      setResultPostId(postId);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Brief */}
      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          1. Ý tưởng nội dung
        </h2>
        <div className="space-y-3">
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="Mô tả ngắn nội dung bạn muốn đăng, ví dụ: khuyến mãi sân badminton cuối tuần, giảm 20%..."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="flex gap-3">
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Không thuộc chiến dịch</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as "facebook" | "instagram")
              }
            >
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
            <button
              type="button"
              onClick={generateCaption}
              disabled={!brief.trim() || generatingCaption}
              className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {generatingCaption ? "Đang sinh..." : "Sinh caption (AI)"}
            </button>
          </div>
        </div>
      </section>

      {/* Step 2: Caption */}
      {(step === "caption" || step === "media" || step === "channels" || step === "done") && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            2. Caption
          </h2>
          {variants.length > 0 && (
            <div className="mb-3 flex gap-2">
              {variants.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedVariant(i);
                    applyVariant(v);
                  }}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${
                    i === selectedVariant
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  Phiên bản {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="#hashtag1 #hashtag2"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Call to action (tuỳ chọn)"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
            />
          </div>
          {step === "caption" && (
            <button
              type="button"
              onClick={() => setStep("media")}
              disabled={!caption.trim()}
              className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Tiếp tục
            </button>
          )}
        </section>
      )}

      {/* Step 3: Banner (optional) */}
      {(step === "media" || step === "channels" || step === "done") && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            3. Banner (tuỳ chọn)
          </h2>
          <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={wantBanner}
              onChange={(e) => setWantBanner(e.target.checked)}
            />
            Sinh banner cho bài này
          </label>
          {wantBanner && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <select
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Tiêu đề (mặc định lấy từ caption)"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                />
              </div>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Phụ đề (tuỳ chọn)"
                value={bannerSubtitle}
                onChange={(e) => setBannerSubtitle(e.target.value)}
              />
              <button
                type="button"
                onClick={generateBanner}
                disabled={generatingBanner}
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {generatingBanner ? "Đang tạo..." : "Tạo banner"}
              </button>
              {banner && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={banner.url}
                  alt="Banner preview"
                  className="mt-2 max-h-64 rounded-md border border-gray-200"
                />
              )}
            </div>
          )}
          {step === "media" && (
            <button
              type="button"
              onClick={() => setStep("channels")}
              className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Tiếp tục
            </button>
          )}
        </section>
      )}

      {/* Step 4: Channels + submit */}
      {(step === "channels" || step === "done") && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            4. Kênh đăng &amp; lịch
          </h2>
          {channels.length === 0 ? (
            <p className="text-sm text-gray-500">
              Chưa có kênh nào được kết nối.{" "}
              <a href="/channels" className="text-blue-600 underline">
                Kết nối kênh
              </a>
            </p>
          ) : (
            <div className="mb-4 space-y-1">
              {channels.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedChannels.has(c.id)}
                    onChange={() => toggleChannel(c.id)}
                    disabled={c.status !== "active"}
                  />
                  {c.name}
                  <span className="text-xs capitalize text-gray-400">
                    ({c.platform}
                    {c.status !== "active" ? `, ${c.status}` : ""})
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "now"}
                onChange={() => setMode("now")}
              />
              Đăng ngay
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "schedule"}
                onChange={() => setMode("schedule")}
              />
              Lên lịch
            </label>
            {mode === "schedule" && (
              <input
                type="datetime-local"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            )}
          </div>

          {step === "channels" && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting
                ? "Đang xử lý..."
                : mode === "now"
                  ? "Đăng ngay"
                  : "Lên lịch"}
            </button>
          )}
        </section>
      )}

      {step === "done" && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Đã tạo bài viết{" "}
          {mode === "now" ? "và đưa vào hàng đợi đăng ngay" : "và lên lịch"}.{" "}
          <a href="/calendar" className="underline">
            Xem lịch đăng
          </a>
          .
        </div>
      )}
    </div>
  );
}
