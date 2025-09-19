"use strict";

try { importScripts("storage-migrations.js"); if (self.migrateStorageIfNeeded) { self.migrateStorageIfNeeded(); } } catch (e) { console.warn("[cfg-AdBlocker] migrate loader error", e); }

// cfg-AdBlocker background (service worker)
// - onInstalled: varsayılan state
// - contextMenus: "Bu öğeyi gizle (selector üret)"
// - messaging: Hemen uygula, picker sonucu, log ekleme

const MENU_PICKER_ID = "cfg-hide-element";
const STORAGE_KEY = "cfgState";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { [STORAGE_KEY]: existing } = await chrome.storage.local.get({ [STORAGE_KEY]: null });
    if (!existing) {
      /** @type {any} */
      const initial = {
        enabled: true,
        safeMode: false,
        version: 1,
        rules: [],
        allowlist: [],
        blocklist: [],
        logs: [],
        localJsLibrary: []
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: initial });
      console.info("[cfg-AdBlocker] Initial storage set.");
    }
  } catch (err) {
    console.error("[cfg-AdBlocker] onInstalled error", err);
  }

  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_PICKER_ID,
      title: "Bu öğeyi gizle (selector üret)",
      contexts: ["all"]
    });
  } catch (err) {
    console.error("[cfg-AdBlocker] contextMenus error", err);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId !== MENU_PICKER_ID) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "CFG_PICKER_START" });
  } catch (err) {
    // Content script yüklü değilse kullanıcı henüz sayfayı yenilememiş olabilir
    console.warn("[cfg-AdBlocker] Picker başlatılamadı, content yok mu?", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "CFG_LOGS_ADD") {
        const entry = msg.entry;
        const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
        const logs = Array.isArray(state?.logs) ? state.logs : [];
        logs.push(entry);
        while (logs.length > 200) logs.shift();
        await chrome.storage.local.set({ [STORAGE_KEY]: { ...state, logs } });
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "CFG_PICKER_RESULT") {
        const { selector, url } = msg;
        // Taslak kural: domain kapsamı ve selector'i gizleyen CSS
        const pattern = deriveDomainPattern(url);
        const draftRuleCandidate = {
          id: cryptoRandomId(),
          name: `Gizle: ${selector}`,
          enabled: true,
          pattern,
          excludePatterns: [],
          scope: "DOMAIN",
          priority: 100,
          runAt: "document_start",
          world: "ISOLATED",
          css: `${selector} { display: none !important; }`,
          cssFiles: [],
          js: "",
          jsFiles: [],
          localJs: [],
          safeMode: false,
          notes: "Context menü ile oluşturulan seçici"
        };
        await chrome.storage.local.set({ draftRuleCandidate });
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "CFG_APPLY_NOW") {
        const { tabId, rule } = msg;
        await applyRuleNow(tabId, rule);
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "CFG_GET_ACTIVE_TAB_URL") {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        sendResponse({ url: tab?.url || null, tabId: tab?.id || null });
        return;
      }
    } catch (err) {
      console.error("[cfg-AdBlocker] onMessage error", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // async
});

async function applyRuleNow(tabId, rule) {
  if (!tabId || !rule) return;
  try {
    if (rule.css && rule.css.trim()) {
      await chrome.scripting.insertCSS({ target: { tabId }, css: rule.css });
    }
    if (Array.isArray(rule.cssFiles)) {
      for (const file of rule.cssFiles) {
        try {
          await chrome.scripting.insertCSS({ target: { tabId }, files: [file] });
        } catch (e) {
          console.warn("[cfg-AdBlocker] insertCSS file failed", file, e);
        }
      }
    }

    const codeParts = [];
    if (rule.js && rule.js.trim()) codeParts.push(rule.js);
    if (Array.isArray(rule.localJs)) {
      for (const lj of rule.localJs) {
        if (lj?.content) codeParts.push(String(lj.content));
      }
    }

    if (Array.isArray(rule.jsFiles) && rule.jsFiles.length) {
      // Uzantı içi dosyaları direkt çalıştır
      await chrome.scripting.executeScript({
        target: { tabId },
        world: rule.world === "MAIN" ? "MAIN" : "ISOLATED",
        files: rule.jsFiles
      });
    }

    if (codeParts.length) {
      const bundle = wrapInIIFE(codeParts.join("\n\n"));
      await chrome.scripting.executeScript({
        target: { tabId },
        world: rule.world === "MAIN" ? "MAIN" : "ISOLATED",
        func: (code) => {
          try { (new Function(code))(); } catch (e) { console.error("[cfg-AdBlocker] applyNow error", e); }
        },
        args: [bundle]
      });
    }
  } catch (err) {
    console.error("[cfg-AdBlocker] applyRuleNow error", err);
  }
}

function wrapInIIFE(code) {
  return `(function(){\ntry {\n${code}\n} catch(e){ console.error('[cfg-AdBlocker] applyNow error', e); }\n})();`;
}

function deriveDomainPattern(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.startsWith("www.") ? u.hostname.slice(4) : u.hostname;
    return `*://*.${host}/*`;
  } catch {
    return "<all_urls>";
  }
}

function cryptoRandomId() {
  const arr = new Uint8Array(16);
  self.crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
