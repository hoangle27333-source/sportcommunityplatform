import { shouldUsePaddleOcr } from "./ocr-service";

export interface ServiceProbeResult {
  configured: boolean;
  reachable: boolean;
  url: string | null;
  error?: string;
}

export interface RemixServiceHealth {
  voicePipeline: ServiceProbeResult & {
    requireV2ForLocalization: boolean;
  };
  ocr: ServiceProbeResult & {
    engine: "gemini" | "paddleocr";
  };
}

export async function getRemixServiceHealth(): Promise<RemixServiceHealth> {
  const voiceUrl = cleanUrl(process.env.VOICE_PIPELINE_URL ?? "");
  const ocrUrl = cleanUrl(process.env.PADDLEOCR_SERVICE_URL ?? "http://ocr:8080");
  const ocrEngine = shouldUsePaddleOcr() ? "paddleocr" : "gemini";

  const [voicePipeline, ocr] = await Promise.all([
    probeHttpHealth(voiceUrl),
    ocrEngine === "paddleocr" ? probeHttpHealth(ocrUrl) : Promise.resolve({
      configured: true,
      reachable: true,
      url: null,
    }),
  ]);

  return {
    voicePipeline: {
      ...voicePipeline,
      requireV2ForLocalization: requireVoicePipelineV2ForLocalization(),
    },
    ocr: {
      ...ocr,
      engine: ocrEngine,
    },
  };
}

export function requireVoicePipelineV2ForLocalization(): boolean {
  return (process.env.VOICE_REQUIRE_V2_FOR_LOCALIZATION ?? "true").toLowerCase() !== "false";
}

async function probeHttpHealth(baseUrl: string): Promise<ServiceProbeResult> {
  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      url: null,
      error: "Service URL chưa được cấu hình.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        configured: true,
        reachable: false,
        url: baseUrl,
        error: `HTTP ${res.status}`,
      };
    }
    return {
      configured: true,
      reachable: true,
      url: baseUrl,
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      url: baseUrl,
      error: (err as Error).name === "AbortError"
        ? "Timeout khi kiểm tra /health."
        : (err as Error).message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
