import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Fetch a remote URL into a Buffer (for editing uploaded/asset URLs). */
export async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildStoragePath(type: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rand = crypto.randomUUID();
  return `${type}/${yyyy}/${mm}/${rand}.${ext}`;
}
