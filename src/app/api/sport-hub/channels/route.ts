import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStoredEntityChannels,
  saveStoredEntityChannels,
} from "@/lib/sport-hub/channel-store";
import {
  getKolAggregates,
  getCommunityAggregates,
  getKolChannels,
  getCommunityChannels,
} from "@/lib/sport-hub/kol-channels";

export const dynamic = "force-dynamic";

/**
 * POST /api/sport-hub/channels
 * Appends or updates a social channel on an existing KOL or Community
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entityType, entityId, entityName, channel } = body;

    if (!entityType || (!entityId && !entityName) || !channel) {
      return NextResponse.json(
        { success: false, error: "Missing entityType, entityId, or channel payload" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const table = entityType === "kol" ? "kols" : "communities";

    // 1. Fetch current entity record from Supabase (by ID or by name)
    let entity: any = null;

    if (entityId) {
      const { data: byId } = await supabase
        .from(table)
        .select("*")
        .eq("id", entityId)
        .maybeSingle();
      entity = byId;
    }

    const lookupName = entityName || body.name;
    if (!entity && lookupName) {
      const { data: byName } = await supabase
        .from(table)
        .select("*")
        .ilike("name", lookupName.trim())
        .maybeSingle();
      entity = byName;
    }

    if (!entity && (lookupName || entityId)) {
      const { data: all } = await supabase.from(table).select("*");
      const targetStr = (lookupName || entityId).toLowerCase().trim();
      entity = (all || []).find((e: any) =>
        e.id === entityId || (e.name && e.name.toLowerCase().trim() === targetStr)
      );
    }

    const resolvedName = entity?.name || lookupName || entityId || "Unknown";
    const resolvedId = entity?.id || entityId;

    // 2. Fetch existing channels
    let currentChannels =
      getStoredEntityChannels(entityType, resolvedId, resolvedName) ||
      (entity
        ? (entityType === "kol"
            ? getKolChannels({ ...entity, channels: entity.channels })
            : getCommunityChannels({ ...entity, channels: entity.channels }))
        : []);

    // 3. Format new channel
    const newChannel = {
      ...channel,
      followers: Number(channel.followers) || Number(channel.members) || 0,
      members: Number(channel.members) || Number(channel.followers) || 0,
      avgViews: Number(channel.avgViews) || 0,
      er: Number(channel.er) || 0,
      lastScoutedAt: new Date().toISOString(),
    };

    // If marked as primary, unmark other channels
    if (newChannel.isPrimary) {
      currentChannels = currentChannels.map((c: any) => ({ ...c, isPrimary: false }));
    }

    // Deduplicate: replace channel if same platform & same handle/URL, otherwise append
    const existingIndex = currentChannels.findIndex(
      (c: any) =>
        c.platform.toLowerCase() === newChannel.platform.toLowerCase() &&
        (c.url.toLowerCase() === newChannel.url.toLowerCase() ||
          (c.handle && newChannel.handle && c.handle.toLowerCase() === newChannel.handle.toLowerCase()))
    );

    if (existingIndex >= 0) {
      currentChannels[existingIndex] = {
        ...currentChannels[existingIndex],
        ...newChannel,
      };
    } else {
      currentChannels.push(newChannel);
    }

    // 4. Save to persistent channel store
    await saveStoredEntityChannels(entityType, resolvedId, currentChannels, resolvedName);

    // 5. Recalculate aggregates and update base entity in DB if present
    if (entity) {
      if (entityType === "kol") {
        const aggregates = getKolAggregates({
          ...entity,
          channels: currentChannels,
        } as any);

        await supabase
          .from("kols")
          .update({
            followers: aggregates.totalFollowers,
            avg_views: aggregates.totalAvgViews,
            er: aggregates.blendedEr,
            platform: aggregates.hasMultipleChannels ? "Omni-channel" : aggregates.primaryChannel.platform,
            profile_url: aggregates.primaryChannel.url || entity.profile_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entity.id);
      } else {
        const aggregates = getCommunityAggregates({
          ...entity,
          channels: currentChannels,
        } as any);

        await supabase
          .from("communities")
          .update({
            members_count: aggregates.totalMembers,
            platform: aggregates.hasMultipleChannels ? "Multi-channel" : aggregates.primaryChannel.platform,
            group_url: aggregates.primaryChannel.url || entity.group_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entity.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Added ${newChannel.platform} channel for ${resolvedName}!`,
      channels: currentChannels,
    });
  } catch (err: any) {
    console.error("API /api/sport-hub/channels POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to add channel" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sport-hub/channels
 * Removes a channel from an existing KOL or Community
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { entityType, entityId, entityName, channelIndex, channelUrl } = body;

    if (!entityType || (!entityId && !entityName)) {
      return NextResponse.json(
        { success: false, error: "Missing entityType or entityId" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const table = entityType === "kol" ? "kols" : "communities";

    let entity: any = null;

    if (entityId) {
      const { data: byId } = await supabase
        .from(table)
        .select("*")
        .eq("id", entityId)
        .maybeSingle();
      entity = byId;
    }

    const lookupName = entityName || body.name;
    if (!entity && lookupName) {
      const { data: byName } = await supabase
        .from(table)
        .select("*")
        .ilike("name", lookupName.trim())
        .maybeSingle();
      entity = byName;
    }

    const resolvedName = entity?.name || lookupName || entityId || "Unknown";
    const resolvedId = entity?.id || entityId;

    let currentChannels =
      getStoredEntityChannels(entityType, resolvedId, resolvedName) ||
      (entity
        ? (entityType === "kol"
            ? getKolChannels({ ...entity, channels: entity.channels })
            : getCommunityChannels({ ...entity, channels: entity.channels }))
        : []);

    if (typeof channelIndex === "number" && channelIndex >= 0 && channelIndex < currentChannels.length) {
      currentChannels.splice(channelIndex, 1);
    } else if (channelUrl) {
      currentChannels = currentChannels.filter((c: any) => c.url !== channelUrl);
    }

    // If remaining channels have no primary, assign the first one
    if (currentChannels.length > 0 && !currentChannels.some((c: any) => c.isPrimary)) {
      currentChannels[0].isPrimary = true;
    }

    await saveStoredEntityChannels(entityType, resolvedId, currentChannels, resolvedName);

    // Recalculate aggregates in DB if present
    if (entity) {
      if (entityType === "kol") {
        const aggregates = getKolAggregates({
          ...entity,
          channels: currentChannels,
        } as any);

        await supabase
          .from("kols")
          .update({
            followers: aggregates.totalFollowers,
            avg_views: aggregates.totalAvgViews,
            er: aggregates.blendedEr,
            platform: aggregates.hasMultipleChannels ? "Omni-channel" : (aggregates.primaryChannel?.platform || "Individual KOL"),
            profile_url: aggregates.primaryChannel?.url || entity.profile_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entity.id);
      } else {
        const aggregates = getCommunityAggregates({
          ...entity,
          channels: currentChannels,
        } as any);

        await supabase
          .from("communities")
          .update({
            members_count: aggregates.totalMembers,
            platform: aggregates.hasMultipleChannels ? "Multi-channel" : (aggregates.primaryChannel?.platform || "Community"),
            group_url: aggregates.primaryChannel?.url || entity.group_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entity.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Channel removed successfully",
      channels: currentChannels,
    });
  } catch (err: any) {
    console.error("API /api/sport-hub/channels DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete channel" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sport-hub/channels
 * Batch updates the entire channels array for a KOL or Community,
 * persists the channels, and synchronizes aggregated metrics with Supabase.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { entityType, entityId, entityName, channels, specs } = body;

    if (!entityType || (!entityId && !entityName) || !Array.isArray(channels)) {
      return NextResponse.json(
        { success: false, error: "Missing entityType, entityId, or channels array" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const table = entityType === "kol" ? "kols" : "communities";

    // 1. Fetch current entity
    let entity: any = null;
    if (entityId) {
      const { data: byId } = await supabase
        .from(table)
        .select("*")
        .eq("id", entityId)
        .maybeSingle();
      entity = byId;
    }
    const lookupName = entityName || body.name;
    if (!entity && lookupName) {
      const { data: byName } = await supabase
        .from(table)
        .select("*")
        .ilike("name", lookupName.trim())
        .maybeSingle();
      entity = byName;
    }

    const resolvedName = entity?.name || lookupName || entityId || "Unknown";
    const resolvedId = entity?.id || entityId;

    // 2. Format and sanitize channels
    const formattedChannels = channels.map((ch: any) => ({
      ...ch,
      platform: ch.platform || "Social Media",
      handle: ch.handle || "",
      url: ch.url || "#",
      followers: Number(ch.followers) || Number(ch.members) || 0,
      members: Number(ch.members) || Number(ch.followers) || 0,
      avgViews: Number(ch.avgViews) || 0,
      er: Number(ch.er) || 0,
      isPrimary: Boolean(ch.isPrimary),
      lastScoutedAt: ch.lastScoutedAt || new Date().toISOString(),
    }));

    // Ensure at least one primary channel if channels exist
    if (formattedChannels.length > 0 && !formattedChannels.some((c: any) => c.isPrimary)) {
      formattedChannels[0].isPrimary = true;
    }

    // 3. Persist to channel store
    await saveStoredEntityChannels(entityType, resolvedId, formattedChannels, resolvedName);

    // 4. Update Supabase record with aggregates and any updated specs
    let updatedRecord: any = null;
    if (entity) {
      if (entityType === "kol") {
        const aggregates = getKolAggregates({
          ...entity,
          channels: formattedChannels,
        } as any);

        const updatePayload: Record<string, any> = {
          followers: aggregates.totalFollowers,
          avg_views: aggregates.totalAvgViews,
          er: aggregates.blendedEr,
          platform: aggregates.hasMultipleChannels ? "Omni-channel" : (aggregates.primaryChannel?.platform || "Individual KOL"),
          profile_url: aggregates.primaryChannel?.url || entity.profile_url,
          updated_at: new Date().toISOString(),
        };

        if (specs) {
          if (specs.name) updatePayload.name = specs.name;
          if (specs.tier) updatePayload.tier = specs.tier;
          if (specs.geography) updatePayload.geography = specs.geography;
          if (specs.status) updatePayload.status = specs.status;
          if (specs.quotation !== undefined) updatePayload.quotation = Number(specs.quotation) || 0;
          if (specs.info !== undefined) updatePayload.contact_info = specs.info;
          if (specs.bio !== undefined) updatePayload.bio = specs.bio;
          if (specs.sport && Array.isArray(specs.sport)) updatePayload.sports = specs.sport;
        }

        const { data: rec, error } = await supabase
          .from("kols")
          .update(updatePayload)
          .eq("id", entity.id)
          .select()
          .single();

        if (!error && rec) {
          updatedRecord = rec;
        }
      } else {
        const aggregates = getCommunityAggregates({
          ...entity,
          channels: formattedChannels,
        } as any);

        const updatePayload: Record<string, any> = {
          members_count: aggregates.totalMembers,
          platform: aggregates.hasMultipleChannels ? "Multi-channel" : (aggregates.primaryChannel?.platform || "Community"),
          group_url: aggregates.primaryChannel?.url || entity.group_url,
          updated_at: new Date().toISOString(),
        };

        if (specs) {
          if (specs.name) updatePayload.name = specs.name;
          if (specs.geography) updatePayload.geography = specs.geography;
          if (specs.status) updatePayload.status = specs.status;
          if (specs.pricePerPin !== undefined) updatePayload.price_per_pin = Number(specs.pricePerPin) || 0;
          if (specs.activityLevel) updatePayload.activity_level = specs.activityLevel;
          if (specs.sport && Array.isArray(specs.sport)) updatePayload.sports = specs.sport;
        }

        const { data: rec, error } = await supabase
          .from("communities")
          .update(updatePayload)
          .eq("id", entity.id)
          .select()
          .single();

        if (!error && rec) {
          updatedRecord = rec;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Channels and metrics saved successfully for ${resolvedName}!`,
      channels: formattedChannels,
      record: updatedRecord,
    });
  } catch (err: any) {
    console.error("API /api/sport-hub/channels PUT error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update channels" },
      { status: 500 }
    );
  }
}

