import type { SupabaseClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Media storage helper (SPEC §3, §7).
 *
 * Uploads generated/edited/uploaded media to Supabase Storage and records a
 * media_assets row. All generators (banner Satori/Sharp, image-edit, video,
 * ComfyUI) funnel through here so asset bookkeeping is consistent:
 *   - one storage object per asset, addressed by storage_path
 *   - a public URL (bucket is public-read) stored on the row for publishing
 *   - generated_by provenance + optional source asset id in meta
 *
 * The bucket name is configurable; it must exist (created by migration/seed or
 * the Supabase dashboard). Uploads use the service-role client in workers.
 */

export const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET ?? "media";

export type GeneratedBy =
  | "comfyui"
  | "satori"
  | "remotion"
  | "upload"
  | "image-edit";

export interface StoredAsset {
  id: string;
  url: string;
  storagePath: string;
  type: "image" | "video" | "banner";
}

export interface UploadMediaInput {
  buffer: Buffer;
  contentType: string;
  /** File extension without dot, e.g. "png", "jpg", "mp4". */
  ext: string;
  type: "image" | "video" | "banner";
  generatedBy: GeneratedBy;
  createdBy?: string;
  /** Arbitrary provenance / dimensions / source asset id. */
  meta?: Record<string, unknown>;
}

/** Upload a buffer to storage and insert the media_assets row. */
export async function uploadMediaAsset(
  db: SupabaseClient,
  input: UploadMediaInput,
): Promise<StoredAsset> {
  const path = buildStoragePath(input.type, input.ext);

  const { error: uploadErr } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, input.buffer, {
      contentType: input.contentType,
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`storage upload failed: ${uploadErr.message}`);
  }

  const {
    data: { publicUrl },
  } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const { data: row, error: insErr } = await db
    .from("media_assets")
    .insert({
      type: input.type,
      url: publicUrl,
      storage_path: path,
      generated_by: input.generatedBy,
      created_by: input.createdBy ?? null,
      meta: input.meta ?? {},
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr || !row) {
    // Best-effort cleanup so we do not orphan the storage object.
    await db.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    throw new Error(`media_assets insert failed: ${insErr?.message}`);
  }

  return { id: row.id, url: publicUrl, storagePath: path, type: input.type };
}

/** Download an existing storage object as a Buffer (for image-edit source). */
export async function downloadMediaObject(
  db: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await db.storage
    .from(MEDIA_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.REMOTE_FETCH_TIMEOUT_MS ?? 30_000);
const DEFAULT_MAX_FETCH_BYTES = Number(process.env.MAX_REMOTE_FETCH_BYTES ?? 250 * 1024 * 1024);
const MAX_REDIRECTS = 5;

/** Fetch a remote URL into a Buffer (for editing uploaded/asset URLs). */
export async function fetchToBuffer(
  url: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<Buffer> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_FETCH_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const res = await fetchWithValidatedRedirects(url, timeoutMs);

  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);

  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new Error(`fetch ${url} failed: response too large (${contentLength} bytes)`);
  }
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`fetch ${url} failed: response exceeded ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function buildStoragePath(type: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rand = crypto.randomUUID();
  return `${type}/${yyyy}/${mm}/${rand}.${ext}`;
}

async function fetchWithValidatedRedirects(url: string, timeoutMs: number): Promise<Response> {
  let current = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertSafeRemoteUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (![301, 302, 303, 307, 308].includes(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) return res;
    current = new URL(location, current).toString();
  }

  throw new Error(`fetch ${url} failed: too many redirects`);
}

async function assertSafeRemoteUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported URL protocol: ${url.protocol}`);
  }
  if (process.env.ALLOW_PRIVATE_REMOTE_FETCH === "true") return;

  const host = url.hostname;
  if (isPrivateAddress(host)) {
    throw new Error(`blocked private URL host: ${host}`);
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error(`blocked private URL host: ${host}`);
  }
}

function isPrivateAddress(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 0) return false;

  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  const parts = normalized.split(".").map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}
