import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

const TRUSTED_VIDEO_PLUGIN_ID = "devlauncher.tools.video-frame-sampler";
const HOST_TARGET = "devlauncher-plugin-host";
const PLUGIN_TARGET = "devlauncher-plugin";

type PluginRequest = {
  target?: string;
  id?: string;
  capability?: string;
  method?: string;
  payload?: unknown;
};

type VideoPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPayload(value: unknown): VideoPayload {
  return isRecord(value) ? value : {};
}

async function handleVideoToolRequest(method: string, payload: unknown) {
  const data = getPayload(payload);

  switch (method) {
    case "pickVideo": {
      return open({
        multiple: false,
        directory: false,
        filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"] }],
      });
    }
    case "pickOutputDir": {
      return open({ multiple: false, directory: true });
    }
    case "probe": {
      return invoke("probe_video", {
        request: {
          pluginId: TRUSTED_VIDEO_PLUGIN_ID,
          inputPath: data.inputPath,
        },
      });
    }
    case "sample": {
      return invoke("sample_video_frames", {
        request: {
          ...data,
          pluginId: TRUSTED_VIDEO_PLUGIN_ID,
        },
      });
    }
    case "cancel": {
      return invoke("cancel_video_frame_sampler", { pluginId: TRUSTED_VIDEO_PLUGIN_ID });
    }
    case "openPath": {
      return invoke("open_video_tool_path", {
        pluginId: TRUSTED_VIDEO_PLUGIN_ID,
        path: data.path,
      });
    }
    default:
      throw new Error(`Unsupported video tool method: ${method}`);
  }
}

export function installPluginCapabilityBridge(
  pluginId: string,
  frame: HTMLIFrameElement | null,
): () => void {
  if (!frame || pluginId !== TRUSTED_VIDEO_PLUGIN_ID) {
    return () => {};
  }

  const postToPlugin = (message: unknown) => {
    frame.contentWindow?.postMessage({ target: PLUGIN_TARGET, ...getPayload(message) }, "*");
  };

  const onMessage = (event: MessageEvent<PluginRequest>) => {
    if (event.source !== frame.contentWindow || event.data?.target !== HOST_TARGET) {
      return;
    }

    const { id, capability, method, payload } = event.data;
    if (!id || capability !== "videoFrameSampler" || !method) {
      return;
    }

    handleVideoToolRequest(method, payload)
      .then((result) => {
        postToPlugin({ id, ok: true, result });
      })
      .catch((err) => {
        postToPlugin({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
      });
  };

  window.addEventListener("message", onMessage);
  const unlisteners = [
    listen("video-frame-sampler://progress", (event) => {
      postToPlugin({ type: "event", event: "progress", payload: event.payload });
    }),
    listen("video-frame-sampler://completed", (event) => {
      postToPlugin({ type: "event", event: "completed", payload: event.payload });
    }),
    listen("video-frame-sampler://failed", (event) => {
      postToPlugin({ type: "event", event: "failed", payload: event.payload });
    }),
  ];

  return () => {
    window.removeEventListener("message", onMessage);
    unlisteners.forEach((promise) => {
      promise.then((unlisten) => unlisten()).catch(console.error);
    });
  };
}
