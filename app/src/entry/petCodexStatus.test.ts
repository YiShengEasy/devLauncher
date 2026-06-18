import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_CODEX_STATUS,
  getPetCodexStatusLabel,
  isPetCodexStatus,
  normalizePetCodexStatusPayload,
} from "./petCodexStatus";

describe("pet Codex status model", () => {
  it("accepts known statuses", () => {
    expect(isPetCodexStatus("thinking")).toBe(true);
    expect(isPetCodexStatus("working")).toBe(true);
    expect(isPetCodexStatus("missing")).toBe(false);
  });

  it("normalizes invalid payloads to idle", () => {
    expect(normalizePetCodexStatusPayload(null)).toEqual(DEFAULT_PET_CODEX_STATUS);
    expect(normalizePetCodexStatusPayload({ status: "missing" })).toEqual(DEFAULT_PET_CODEX_STATUS);
  });

  it("keeps a short status message", () => {
    expect(normalizePetCodexStatusPayload({ status: "waiting", message: "  需要确认权限  " })).toEqual({
      status: "waiting",
      message: "需要确认权限",
    });
  });

  it("has user-facing labels for status display", () => {
    expect(getPetCodexStatusLabel("thinking")).toBe("思考中");
    expect(getPetCodexStatusLabel("disconnected")).toBe("未连接");
  });
});
