const HOST_NAME = "com.devlauncher.webaccounts";

function requestNativeCredentials(origin) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { type: "getCredentials", origin },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, credentials: [], error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, credentials: [], error: "empty native response" });
      },
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "devlauncher:getCredentials") {
    return false;
  }

  requestNativeCredentials(message.origin).then(sendResponse);
  return true;
});
