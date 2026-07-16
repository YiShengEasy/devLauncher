export type RdpClientKind = "auto" | "system" | "free_rdp";
export type RdpHostBackend = "free_rdp_shadow" | "gnome_remote_desktop";
export type RemoteTransport = "rdp" | "websocket_jpeg";

export interface RemoteDeskProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  client_mode: RdpClientKind;
  has_password?: boolean;
}

export interface RdpCapabilities {
  platform: string;
  desktopSession: string;
  clients: RdpClientKind[];
  hostBackends: RdpHostBackend[];
  recommendedClient: RdpClientKind | null;
  recommendedHost: RdpHostBackend | null;
  hostErrorCode: string | null;
  executables: Record<string, string>;
}

export interface RdpLaunchResult {
  client: RdpClientKind;
  executable: string;
}

export interface RdpHostInfo {
  backend: RdpHostBackend;
  desktopSession: string;
  address: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  nla: boolean;
}

export interface RdpHostStatus {
  running: boolean;
  backend: RdpHostBackend | null;
  desktopSession: string;
  address: string | null;
  port: number | null;
  tls: boolean;
  nla: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

type LegacyProfile = Omit<RemoteDeskProfile, "client_mode"> & {
  client_mode?: RdpClientKind;
};

export function normalizeProfile(profile: LegacyProfile): RemoteDeskProfile {
  return {
    ...profile,
    client_mode: profile.client_mode ?? "auto",
  };
}

export function clientLabel(client: RdpClientKind): string {
  switch (client) {
    case "system":
      return "系统 RDP";
    case "free_rdp":
      return "FreeRDP";
    default:
      return "自动选择";
  }
}

export function backendLabel(backend: RdpHostBackend | null): string {
  switch (backend) {
    case "free_rdp_shadow":
      return "FreeRDP Shadow";
    case "gnome_remote_desktop":
      return "GNOME Remote Desktop";
    default:
      return "未检测到";
  }
}

export function desktopLabel(session: string): string {
  switch (session) {
    case "windows_console":
      return "Windows 当前桌面";
    case "x11":
      return "Linux X11 当前桌面";
    case "gnome_wayland":
      return "GNOME Wayland 当前桌面";
    case "macos_console":
      return "macOS 当前桌面";
    case "other_wayland":
      return "Wayland 当前桌面";
    default:
      return "未知桌面会话";
  }
}

export function hostAvailabilityMessage(code: string | null | undefined): string {
  switch (code) {
    case "unsupported_wayland":
      return "当前 Wayland 桌面尚无可用的 RDP 当前桌面后端。";
    case "macos_host_phase_2":
      return "macOS RDP 主机端将在第二阶段开放，当前仍可使用兼容模式。";
    case "host_backend_missing":
      return "未找到 RDP 主机后端，请安装 FreeRDP Shadow 或启用 GNOME Remote Desktop。";
    case "certificate_tool_missing":
      return "缺少 winpr-makecert，无法生成 RDP TLS 证书。";
    case "existing_rdp_service":
      return "系统 RDP 服务已在运行，DevLauncher 不会覆盖现有配置。";
    case "port_in_use":
      return "RDP 端口已被占用，请停止占用服务后重试。";
    case "permission_missing":
      return "缺少屏幕控制权限，请完成系统授权后重试。";
    case "host_exited":
      return "RDP 主机进程意外退出，请检查后端版本与日志。";
    default:
      return "";
  }
}

export function transportLabel(transport: RemoteTransport): string {
  return transport === "rdp" ? "RDP" : "兼容模式";
}

export function visibleHostCredentials(
  status: RdpHostStatus,
  info: RdpHostInfo | null,
): Pick<RdpHostInfo, "username" | "password"> | null {
  if (!status.running || !info) return null;
  return { username: info.username, password: info.password };
}
