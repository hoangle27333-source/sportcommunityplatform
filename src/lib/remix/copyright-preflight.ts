import type {
  CopyrightPreflightItem,
  CopyrightPreflightResult,
  RemixOptions,
  RemixSourceType,
} from "./types";

export interface BuildCopyrightPreflightInput {
  sourceType?: RemixSourceType | string;
  ownershipConfirmed?: boolean;
  options?: RemixOptions | Record<string, unknown>;
  hasAudio?: boolean;
}

export function buildFacebookCopyrightPreflight(
  input: BuildCopyrightPreflightInput,
): CopyrightPreflightResult {
  const options = (input.options ?? {}) as RemixOptions;
  const items: CopyrightPreflightItem[] = [];

  const add = (
    id: string,
    label: string,
    status: CopyrightPreflightItem["status"],
    detail: string,
  ) => items.push({ id, label, status, detail });

  if (input.sourceType === "inspiration") {
    add(
      "source_rights",
      "Nguồn tham khảo bên thứ ba",
      "warning",
      "Không tải hoặc tái sử dụng file gốc; chỉ dùng công thức nội dung và asset bạn có quyền dùng.",
    );
  } else if (input.sourceType === "own_link" && !input.ownershipConfirmed) {
    add(
      "source_rights",
      "Chưa xác nhận quyền sở hữu link",
      "fail",
      "Facebook yêu cầu bạn chỉ đăng nội dung bạn tạo, sở hữu, được cấp phép hoặc có ngoại lệ hợp lệ.",
    );
  } else {
    add(
      "source_rights",
      "Quyền sử dụng nguồn",
      "pass",
      "Nguồn đang được đánh dấu là upload/link của bạn hoặc đã có xác nhận quyền sử dụng.",
    );
  }

  const keepsOriginalAudio =
    input.hasAudio !== false &&
    !options.muteOriginal &&
    options.dubMode !== "full" &&
    options.dubMode !== "heygen" &&
    options.scriptInputMode !== "manual_script";
  add(
    "recorded_music",
    "Âm thanh/nhạc trong video",
    keepsOriginalAudio ? "warning" : "pass",
    keepsOriginalAudio
      ? "Nếu audio có nhạc thu âm dài/dày hoặc là mục đích chính của video, video có thể bị mute/block/claim."
      : "Audio gốc được mute/thay bằng voice/script mới nên giảm rủi ro nhạc thu âm không có quyền.",
  );

  const hasWatermarkCover =
    Boolean(options.watermarkConfig?.coverOriginal && options.watermarkConfig.oldWatermarkRegions?.length) ||
    Boolean(options.blurOriginalSub || options.autoDetectSubtitleRegion);
  add(
    "visual_marks",
    "Logo/watermark/platform mark cũ",
    hasWatermarkCover ? "pass" : "warning",
    hasWatermarkCover
      ? "Có cấu hình che/đè vùng chữ, logo hoặc watermark cũ trước khi export."
      : "Nếu video còn logo nền tảng, TV/movie/game/sports broadcast, hoặc watermark của bên khác, cần xác nhận quyền hoặc che bỏ thủ công.",
  );

  add(
    "editing_not_license",
    "Edit/credit/disclaimer không thay thế giấy phép",
    "warning",
    "Việc chỉnh sửa, ghi nguồn, thêm disclaimer, hoặc thấy người khác đã đăng không tự động làm nội dung an toàn về bản quyền.",
  );

  const riskLevel = items.some((item) => item.status === "fail")
    ? "high"
    : items.filter((item) => item.status === "warning").length >= 3
      ? "high"
      : items.some((item) => item.status === "warning")
        ? "medium"
        : "low";

  return {
    riskLevel,
    items,
    warnings: items
      .filter((item) => item.status !== "pass")
      .map((item) => `${item.label}: ${item.detail}`),
    acknowledgements: options.copyrightPreflight?.acknowledgements,
  };
}
