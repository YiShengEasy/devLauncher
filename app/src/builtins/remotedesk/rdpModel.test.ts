import { describe, expect, it } from "vitest";
import {
  clientLabel,
  hostAvailabilityMessage,
  normalizeProfile,
  transportLabel,
  visibleHostCredentials,
  type RdpHostInfo,
  type RdpHostStatus,
} from "./rdpModel";

describe("RDP frontend model", () => {
  it("defaults old profiles to auto", () => {
    expect(normalizeProfile({
      id: "1",
      name: "Lab",
      host: "host",
      port: 3389,
      username: "dev",
    }).client_mode).toBe("auto");
  });

  it("uses stable Chinese client labels", () => {
    expect(clientLabel("auto")).toBe("自动选择");
    expect(clientLabel("system")).toBe("系统 RDP");
    expect(clientLabel("free_rdp")).toBe("FreeRDP");
  });

  it("explains unsupported Wayland", () => {
    expect(hostAvailabilityMessage("unsupported_wayland")).toContain("Wayland");
  });

  it("labels the legacy transport as compatibility mode", () => {
    expect(transportLabel("websocket_jpeg")).toBe("兼容模式");
  });

  it("hides credentials when the RDP host is stopped", () => {
    const status: RdpHostStatus = {
      running: false,
      backend: null,
      desktopSession: "macos_console",
      address: null,
      port: null,
      tls: false,
      nla: false,
      errorCode: null,
      errorMessage: null,
    };
    const info: RdpHostInfo = {
      backend: "free_rdp_shadow",
      desktopSession: "windows_console",
      address: "10.0.0.8",
      port: 3389,
      username: "devlauncher",
      password: "temporary",
      tls: true,
      nla: true,
    };
    expect(visibleHostCredentials(status, info)).toBeNull();
  });
});
