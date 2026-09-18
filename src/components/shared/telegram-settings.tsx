"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function TelegramSettings() {
  const [chatId, setChatId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchTelegram() {
      try {
        const res = await fetch("/api/profile/telegram");
        if (res.ok) {
          const data = await res.json() as { telegramChatId?: string };
          if (data.telegramChatId) setChatId(data.telegramChatId);
        }
      } catch (err) {
        console.error("Failed to fetch telegram chat id", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTelegram();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profile/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: chatId.trim() || null }),
      });
      if (!res.ok) throw new Error("Update failed");
      setSuccess("Telegram Chat ID saved successfully!");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profile/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: null }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setChatId("");
      setSuccess("Telegram disconnected successfully.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-32 bg-muted/20 rounded-xl" />;
  }

  return (
    <div className="border border-border bg-card text-card-foreground rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-1">📨 Telegram Notifications</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Receive instant alerts when videos finish processing, fail, or receive new feedback.
      </p>

      <div className="text-sm text-muted-foreground mb-6 space-y-2">
        <p className="font-medium text-foreground">Setup instructions:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Find the bot{" "}
            <span className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              @ContentHubBot
            </span>{" "}
            on Telegram
          </li>
          <li>
            Send the command{" "}
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
              /start
            </span>{" "}
            to get your Chat ID
          </li>
          <li>Paste the Chat ID into the field below and click Save</li>
        </ol>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-600 dark:text-green-400">
          ✅ {success}
        </div>
      )}

      <div className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Telegram Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 123456789"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Your personal Chat ID received after sending /start to the bot.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !chatId.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {chatId && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              Disconnect
            </Button>
          )}
        </div>

        {chatId && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            🟢 Connected — Chat ID: {chatId}
          </p>
        )}
      </div>
    </div>
  );
}
