/**
 * Vietnamese-locale formatting helpers shared by every page (NFR6).
 *
 * Centralised so a number never renders with two different groupings in two
 * different tables, and so date formatting is consistent server- and
 * client-side (all formatters pin the "vi-VN" locale + Asia/Ho_Chi_Minh where
 * the timezone matters, rather than inheriting the runtime default — the server
 * is likely UTC while the user is in GMT+7).
 */

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Ho_Chi_Minh";

const NUM = new Intl.NumberFormat("vi-VN");
const NUM1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

const DATE = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TZ,
});

const DAY_MONTH = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TZ,
});

const TIME = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

const WEEKDAY = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  timeZone: TZ,
});

/** Em dash for "no value" — one glyph everywhere so columns line up. */
export const DASH = "—";

export function num(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? DASH : NUM.format(v);
}

/** Compact form for tight cells/axes: 12400 → 12,4K. */
export function compact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const n = Math.abs(v);
  if (n >= 1_000_000_000) return `${NUM1.format(v / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${NUM1.format(v / 1_000_000)}M`;
  if (n >= 1_000) return `${NUM1.format(v / 1_000)}K`;
  return NUM.format(v);
}

export function vnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${NUM.format(Math.round(v))}₫`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${NUM1.format(Number(v.toFixed(digits)))}%`;
}

function toDate(ts: string | Date | null | undefined): Date | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateTime(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? DATE_TIME.format(d) : DASH;
}

export function date(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? DATE.format(d) : DASH;
}

export function dayMonth(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? DAY_MONTH.format(d) : DASH;
}

export function time(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? TIME.format(d) : DASH;
}

export function weekday(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? WEEKDAY.format(d) : DASH;
}

/**
 * Relative time in Vietnamese ("3 phút trước", "trong 2 giờ"). Used for feeds
 * where the exact timestamp matters less than recency; pair it with a `title`
 * carrying the absolute time so the precise value stays available.
 */
export function relative(ts: string | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return DASH;

  const deltaSec = Math.round((d.getTime() - Date.now()) / 1000);
  const future = deltaSec > 0;
  const abs = Math.abs(deltaSec);

  let value = abs;
  let unit = "giây";
  if (abs < 60) {
    value = abs;
    unit = "giây";
  } else if (abs < 3600) {
    value = Math.round(abs / 60);
    unit = "phút";
  } else if (abs < 86_400) {
    value = Math.round(abs / 3600);
    unit = "giờ";
  } else if (abs < 604_800) {
    value = Math.round(abs / 86_400);
    unit = "ngày";
  } else {
    // Beyond a week the absolute date is more useful than "5 tuần trước".
    return date(d);
  }

  return future ? `trong ${value} ${unit}` : `${value} ${unit} trước`;
}

/** Percentage change between two periods; null when the base is 0/absent. */
export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Truncate for single-line cells, preserving whole words where possible. */
export function truncate(text: string, max = 90): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Engagement rate as a percentage of reach; null when reach is unknown. */
export function engagementRate(
  engagement: number | null,
  reach: number | null,
): number | null {
  if (!engagement || !reach) return null;
  return (engagement / reach) * 100;
}
