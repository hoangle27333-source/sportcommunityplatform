export type RemixDubMode = "none" | "full" | "preserve_bgm" | "heygen";

export interface RemixPreflightOptionsLike {
  outputKind?: string | null;
  vietsub?: boolean | null;
  dubVi?: boolean | null;
  dubMode?: string | null;
  translateOnScreenText?: boolean | null;
}

export function requiresVoicePipelineForRemix(
  input: RemixPreflightOptionsLike,
): boolean {
  if (input.outputKind !== "video") return false;
  const dubMode = normalizeDubMode(input.dubMode, input.dubVi);
  if (dubMode === "heygen") return false;
  return Boolean(input.vietsub || dubMode === "full" || dubMode === "preserve_bgm");
}

export function requiresOcrServiceForRemix(
  input: RemixPreflightOptionsLike,
  engine: string,
): boolean {
  return input.outputKind === "video" &&
    Boolean(input.translateOnScreenText) &&
    engine.toLowerCase() === "paddleocr";
}

function normalizeDubMode(
  dubMode: string | null | undefined,
  dubVi: boolean | null | undefined,
): RemixDubMode {
  if (dubMode === "full" || dubMode === "preserve_bgm" || dubMode === "heygen") {
    return dubMode;
  }
  if (dubVi) return "full";
  return "none";
}
