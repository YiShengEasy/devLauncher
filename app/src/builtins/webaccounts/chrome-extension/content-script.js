function visibleInput(input) {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function findPasswordInput(selector) {
  if (selector) {
    const selected = document.querySelector(selector);
    if (selected instanceof HTMLInputElement) return selected;
  }
  return Array.from(document.querySelectorAll("input[type='password']")).find(visibleInput) || null;
}

function findUsernameInput(selector, passwordInput) {
  if (selector) {
    const selected = document.querySelector(selector);
    if (selected instanceof HTMLInputElement) return selected;
  }

  const candidates = Array.from(document.querySelectorAll("input")).filter((input) => {
    if (!(input instanceof HTMLInputElement) || !visibleInput(input)) return false;
    const type = (input.getAttribute("type") || "text").toLowerCase();
    return ["text", "email", "tel", "search", ""].includes(type);
  });

  if (!passwordInput) return candidates[0] || null;
  const beforePassword = candidates.filter((input) => {
    return Boolean(input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  return beforePassword.at(-1) || candidates[0] || null;
}

function setNativeValue(input, value) {
  const proto = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findSubmitButton(passwordInput) {
  const form = passwordInput?.form;
  if (!form) return null;
  return form.querySelector("button[type='submit'], input[type='submit'], button:not([type])");
}

function fillCredential(credential) {
  const passwordInput = findPasswordInput(credential.passwordSelector);
  const usernameInput = findUsernameInput(credential.usernameSelector, passwordInput);
  if (!passwordInput || !usernameInput) return false;

  setNativeValue(usernameInput, credential.username);
  setNativeValue(passwordInput, credential.password);

  if (credential.autoSubmit) {
    const submitButton = findSubmitButton(passwordInput);
    if (submitButton) {
      submitButton.click();
    } else if (passwordInput.form) {
      passwordInput.form.requestSubmit();
    }
  }

  return true;
}

let fillInProgress = false;
let filledOnce = false;

async function fillFromDevLauncher() {
  if (fillInProgress || filledOnce) return;
  if (!findPasswordInput()) return;

  fillInProgress = true;
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "devlauncher:getCredentials",
      origin: window.location.origin,
    });
  } catch {
    return;
  } finally {
    fillInProgress = false;
  }

  if (!response?.ok || !Array.isArray(response.credentials) || response.credentials.length === 0) {
    return;
  }

  filledOnce = fillCredential(response.credentials[0]);
}

fillFromDevLauncher();

const observer = new MutationObserver(() => {
  fillFromDevLauncher();
});

observer.observe(document.documentElement, { childList: true, subtree: true });
