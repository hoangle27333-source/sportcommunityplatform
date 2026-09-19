import fs from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";

interface ChannelsStoreData {
  kols: Record<string, any[]>;
  communities: Record<string, any[]>;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "channels_store.json");

// In-memory cache for speed
let inMemoryStore: ChannelsStoreData | null = null;

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create .data directory:", err);
  }
}

function loadStore(): ChannelsStoreData {
  if (inMemoryStore) {
    return inMemoryStore;
  }

  ensureDataDir();

  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, "utf-8");
      inMemoryStore = JSON.parse(content);
      return inMemoryStore!;
    }
  } catch (err) {
    console.warn("Could not read channels_store.json, creating new store:", err);
  }

  inMemoryStore = {
    kols: {},
    communities: {},
    updatedAt: new Date().toISOString(),
  };

  return inMemoryStore;
}

function persistStore(data: ChannelsStoreData): void {
  inMemoryStore = data;
  try {
    ensureDataDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist channels_store.json:", err);
  }
}

/**
 * Retrieve stored channels for a KOL or Community.
 * Matches by entity ID, or falls back to matching by name.
 */
export function getStoredEntityChannels(
  type: "kol" | "community",
  id: string,
  name?: string
): any[] | null {
  const store = loadStore();
  const bucket = type === "kol" ? store.kols : store.communities;

  if (bucket[id] && Array.isArray(bucket[id]) && bucket[id].length > 0) {
    return bucket[id];
  }

  if (name) {
    const normalized = name.trim().toLowerCase();
    for (const [key, channels] of Object.entries(bucket)) {
      if (key.trim().toLowerCase() === normalized && Array.isArray(channels) && channels.length > 0) {
        return channels;
      }
    }
  }

  return null;
}

/**
 * Persist channels for an entity.
 */
export async function saveStoredEntityChannels(
  type: "kol" | "community",
  id: string,
  channels: any[],
  name?: string
): Promise<void> {
  const store = loadStore();
  const bucket = type === "kol" ? store.kols : store.communities;

  bucket[id] = channels;
  if (name) {
    bucket[name.trim()] = channels;
  }

  store.updatedAt = new Date().toISOString();
  persistStore(store);

  // Background audit trail sync to Supabase if available
  try {
    const supabase = createAdminClient();
    await supabase.from("audit_log").insert({
      action: "channels_update",
      entity: type,
      entity_id: id,
      detail: { channelsCount: channels.length, channels, name },
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Remove stored channels for an entity.
 */
export async function deleteStoredEntityChannels(
  type: "kol" | "community",
  id: string,
  name?: string
): Promise<void> {
  const store = loadStore();
  const bucket = type === "kol" ? store.kols : store.communities;

  delete bucket[id];
  if (name) {
    delete bucket[name.trim()];
  }

  store.updatedAt = new Date().toISOString();
  persistStore(store);
}
