import type { CSSProperties, ReactNode } from "react";

const panelStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  padding: 14,
};

const codeStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(0,0,0,0.28)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 12,
  lineHeight: 1.55,
  fontFamily: "Consolas, 'Cascadia Code', monospace",
  wordBreak: "break-all",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <h2 style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.90)" }}>{title}</h2>
      <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

export function WebAccountsApp() {
  const isMac = navigator.platform.startsWith("Mac");

  return (
    <div style={{
      minHeight: "100vh",
      padding: 18,
      boxSizing: "border-box",
      color: "#f8fafc",
      background: "linear-gradient(180deg, rgba(10,12,20,0.94), rgba(16,20,32,0.94))",
      fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>网页账号</h1>
        <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.6 }}>
          外置 Google Chrome 自动填入需要 Chrome 扩展与 Native Messaging Host。
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Section title="扩展目录">
          在 Chrome 的 `chrome://extensions` 中加载 unpacked extension：
          <code style={codeStyle}>app/src/builtins/webaccounts/chrome-extension</code>
        </Section>

        <Section title="Native Host">
          Host 名称固定为：
          <code style={codeStyle}>com.devlauncher.webaccounts</code>
          编译目标：
          <code style={codeStyle}>
            {isMac
              ? "app/src-tauri/target/debug/devlauncher_native_host"
              : "app/src-tauri/target/debug/devlauncher_native_host.exe"}
          </code>
          {isMac && (
            <p style={{ color: "#fbbf24", fontSize: 12 }}>
              macOS Native Messaging 注册路径与 Windows 注册表不同，本版本先展示二进制路径，自动安装脚本不在 macOS MVP 范围内。
            </p>
          )}
        </Section>

        <Section title="安全边界">
          密码只保存到系统凭据库。配置文件仅保存网址、origin、用户名、是否启用自动填入和选择器。扩展只按当前页面 origin 请求凭据，默认只填入，不自动提交。
        </Section>

        <Section title="当前阶段">
          已完成 DevLauncher URL 绑定字段、OS keyring 凭据命令、Chrome 打开逻辑、Chrome 扩展骨架和 Rust Native Messaging Host 骨架。下一步是安装扩展并做真实 Chrome 联调。
        </Section>
      </div>
    </div>
  );
}
