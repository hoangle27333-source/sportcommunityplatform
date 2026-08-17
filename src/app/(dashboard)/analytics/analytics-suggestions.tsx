import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { Clock, Type, Hash, Image, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Suggestion {
  id: string;
  type: string;
  content: string;
  rationale: string | null;
}

interface AnalyticsSuggestionsProps {
  suggestions: Suggestion[];
}

type BadgeTone = "info" | "primary" | "success" | "warning" | "neutral";

interface TypeConfig {
  icon: LucideIcon;
  tone: BadgeTone;
  label: string;
  puck: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  best_time: {
    icon: Clock,
    tone: "info",
    label: "Thời điểm tốt nhất",
    puck: "bg-info-muted text-info",
  },
  caption_style: {
    icon: Type,
    tone: "primary",
    label: "Phong cách caption",
    puck: "bg-primary-muted text-primary",
  },
  hashtag_set: {
    icon: Hash,
    tone: "success",
    label: "Bộ hashtag",
    puck: "bg-success-muted text-success",
  },
  media_type: {
    icon: Image,
    tone: "warning",
    label: "Loại nội dung",
    puck: "bg-warning-muted text-warning",
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  icon: Lightbulb,
  tone: "neutral",
  label: "Gợi ý",
  puck: "bg-muted text-muted-foreground",
};

export function AnalyticsSuggestions({ suggestions }: AnalyticsSuggestionsProps) {
  if (!suggestions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có đề xuất. Chạy phân tích chiến dịch để sinh AI learnings.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {suggestions.map((s) => {
        const config = TYPE_CONFIG[s.type] ?? DEFAULT_CONFIG;
        const Icon = config.icon;

        return (
          <div
            key={s.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              {/* Icon puck */}
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  config.puck,
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <Badge tone={config.tone}>{config.label}</Badge>
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
                  {s.content}
                </p>
                {s.rationale && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {s.rationale}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
