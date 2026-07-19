import { BindingModal } from "@/components/BindingModal";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { DEFAULT_THEME, type KeyboardConfig, type WorkflowRun } from "@/types/actions";

const PREVIEW_CONFIG: KeyboardConfig = {
  schemaVersion: 2,
  revision: 1,
  theme: DEFAULT_THEME,
  pages: [
    { name: "开发", keys: {} },
    { name: "常用", keys: {} },
  ],
  workflows: [
    {
      id: "workflow-devlauncher-macos-release",
      name: "发布 DevLauncher：macOS + GitHub + 官网",
      description: "由 MCP 创建的生产发布流水线：检查工作区、运行测试、构建官网与 DMG，经人工确认后发布 GitHub Release、部署 ECS 官网并执行健康检查。",
      enabled: true,
      failurePolicy: "stop",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      steps: [
        {
          id: "release-preflight",
          name: "发布前检查",
          enabled: true,
          action: {
            type: "script",
            name: "发布前检查",
            shell: "terminal",
            content: "检查 main 分支、干净工作区、GitHub CLI、SSH 与登录状态",
          },
          condition: { type: "always" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 60_000 },
          delayMs: 0,
        },
        {
          id: "release-quality-gate",
          name: "测试与前端构建",
          enabled: true,
          action: {
            type: "script",
            name: "测试与前端构建",
            shell: "terminal",
            content: "npm test -- --run && npm run build && cargo test",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 1_200_000 },
          delayMs: 0,
        },
        {
          id: "release-build-website",
          name: "构建产品官网",
          enabled: true,
          action: {
            type: "script",
            name: "构建产品官网",
            shell: "terminal",
            content: "cd website && npm run build",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
          delayMs: 0,
        },
        {
          id: "release-build-dmg",
          name: "生成 macOS DMG",
          enabled: true,
          action: {
            type: "script",
            name: "生成 macOS DMG",
            shell: "terminal",
            content: "cd app && npm run release:mac",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 2_400_000 },
          delayMs: 0,
        },
        {
          id: "release-manual-approval",
          name: "人工确认发布",
          enabled: true,
          action: {
            type: "script",
            name: "检查待发布产物",
            shell: "terminal",
            content: "显示版本号、DMG 路径与 SHA-256，等待人工确认",
          },
          condition: { type: "previous_success" },
          completion: { type: "manual" },
          delayMs: 0,
        },
        {
          id: "release-github",
          name: "推送代码并发布 GitHub Release",
          enabled: true,
          action: {
            type: "script",
            name: "发布 GitHub Release",
            shell: "terminal",
            content: "scripts/publish-github-release.sh",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 600_000 },
          delayMs: 0,
        },
        {
          id: "release-deploy-ecs",
          name: "部署官网到 ECS Podman",
          enabled: true,
          action: {
            type: "script",
            name: "部署 ECS 官网",
            shell: "terminal",
            content: "通过 SSH 将 website/dist 流式写入 Podman 的 Nginx 容器",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 300_000 },
          delayMs: 0,
        },
        {
          id: "release-health-check",
          name: "验证产品官网",
          enabled: true,
          action: {
            type: "script",
            name: "验证产品官网",
            shell: "terminal",
            content: "SITE_URL=${DEVLAUNCHER_SITE_URL:-http://223.6.255.128:8080/}\ncurl --noproxy '*' -fsS --retry 10 \"$SITE_URL\" | grep -q DevLauncher",
          },
          condition: { type: "previous_success" },
          completion: { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
          delayMs: 0,
        },
      ],
    },
    {
      id: "workflow-preview",
      name: "开始 DevLauncher 开发",
      description: "打开项目、启动前端与 Tauri，并把常用窗口排到固定位置。",
      enabled: true,
      failurePolicy: "stop",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      steps: [
        {
          id: "step-app",
          name: "打开 Visual Studio Code",
          enabled: true,
          action: {
            type: "app",
            name: "Visual Studio Code",
            target: "/Applications/Visual Studio Code.app",
          },
          condition: { type: "always" },
          completion: { type: "process_started", stabilizationMs: 800, timeoutMs: 15_000 },
          delayMs: 0,
        },
        {
          id: "step-folder",
          name: "打开 DevLauncher 项目",
          enabled: true,
          action: {
            type: "folder",
            name: "DevLauncher 项目",
            target: "/Users/demo/Projects/devLauncher",
            openWith: "vscode",
          },
          condition: { type: "previous_success" },
          completion: { type: "action_resolved" },
          delayMs: 0,
        },
        {
          id: "step-script",
          name: "启动 Tauri 开发环境",
          enabled: true,
          action: {
            type: "script",
            name: "启动 Tauri 开发环境",
            shell: "terminal",
            content: "npm run tauri:dev:mac",
          },
          condition: { type: "previous_success" },
          completion: { type: "port_ready", host: "127.0.0.1", port: 1420, intervalMs: 500, timeoutMs: 30_000 },
          delayMs: 0,
        },
        {
          id: "step-url",
          name: "打开 GitHub 仓库",
          enabled: true,
          action: {
            type: "url",
            name: "GitHub 仓库",
            target: "https://github.com/example/devlauncher",
          },
          condition: { type: "previous_success" },
          completion: { type: "action_resolved" },
          delayMs: 0,
        },
      ],
    },
    {
      id: "workflow-daily",
      name: "每日启动",
      description: "打开每天使用的开发工具。",
      enabled: true,
      failurePolicy: "continue",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      steps: [],
    },
  ],
};

const PREVIEW_RUN: WorkflowRun = {
  id: "run-release-preview",
  workflowId: "workflow-devlauncher-macos-release",
  workflowName: "发布 DevLauncher：macOS + GitHub + 官网",
  startedAt: 0,
  status: "failed",
  currentStepId: "release-preflight",
  message: "发布前检查 · script exited with code 12: 发布前检查失败：工作区有未提交修改，请先提交代码后重试。",
  steps: (PREVIEW_CONFIG.workflows?.[0]?.steps ?? []).map((step, index) => ({
    stepId: step.id,
    name: step.name,
    status: index === 0 ? "failed" : "pending",
    message: index === 0
      ? "script exited with code 12: README.md\napp/src/App.tsx\napp/src/components/WorkflowPanel.tsx\n发布前检查失败：工作区有未提交修改，请先提交代码后重试。"
      : undefined,
  })),
};

export function WorkflowPreviewApp() {
  const state = new URLSearchParams(window.location.search).get("state");
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background: "#0c111b",
      }}
    >
      <div
        style={{
          width: "calc(100vw - 24px)",
          maxWidth: "calc(100vw - 24px)",
          height: "calc(100vh - 24px)",
          maxHeight: "calc(100vh - 24px)",
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid rgba(119,119,140,0.47)",
          background: "rgba(16,22,34,0.98)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
        }}
      >
        <WorkflowPanel
          config={PREVIEW_CONFIG}
          initialRun={state === "run" ? PREVIEW_RUN : undefined}
          onSaveConfig={async () => {}}
          onClose={() => {}}
        />
      </div>
      {state === "binding" && (
        <BindingModal
          keyId="D"
          workflows={PREVIEW_CONFIG.workflows}
          onSave={() => {}}
          onClose={() => {}}
        />
      )}
    </div>
  );
}
