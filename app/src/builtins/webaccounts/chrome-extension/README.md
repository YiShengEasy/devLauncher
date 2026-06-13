# DevLauncher Web Accounts Chrome Extension

This unpacked Chrome extension fills DevLauncher webpage account bindings in external Google Chrome.

## Local install

1. Build the native host:

   ```powershell
   cd D:\goworkspace\src\aidk\dev-launcher\app\src-tauri
   cargo build --bin devlauncher_native_host
   ```

2. Open `chrome://extensions`, enable Developer mode, and load this directory as an unpacked extension:

   ```text
   D:\goworkspace\src\aidk\dev-launcher\app\src\builtins\webaccounts\chrome-extension
   ```

3. Copy `native-messaging-host.example.json` to a stable local path, replace `REPLACE_WITH_UNPACKED_EXTENSION_ID` with the extension ID shown in Chrome, and make sure `path` points to `devlauncher_native_host.exe`.

4. Register the native host for the current Windows user:

   ```powershell
   reg add HKCU\Software\Google\Chrome\NativeMessagingHosts\com.devlauncher.webaccounts /ve /t REG_SZ /d "D:\path\to\native-messaging-host.json" /f
   ```

5. If DevLauncher stores `keyboard.yaml` somewhere other than the default app data path, set:

   ```powershell
   setx DEVLAUNCHER_CONFIG_PATH "C:\path\to\keyboard.yaml"
   ```

## Runtime behavior

- The content script only requests credentials for `window.location.origin`.
- The native host returns credentials only for URL bindings with `autofill: true` and `hasPassword: true`.
- Passwords are read from the OS credential store and are not stored in the extension.
- The extension fills the first matching credential. Multi-account selection is a later phase.
