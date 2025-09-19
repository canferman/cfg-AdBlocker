"use strict";

// cfg-AdBlocker content script
// - Kuralları storage'dan alır ve URL'ye göre uygular
// - CSS/JS enjeksiyon (inline, dosya, localJs)
// - SPA URL değişimi izleme
// - Element picker overlay (context menü)

const STORAGE_KEY = "cfgState";
const PREFIX = "[cfg-AdBlocker]";

let appliedRuleIds = new Set();
let lastAppliedUrl = location.href;

init().catch((e) => console.error(PREFIX, "init error", e));

async function init() {
  try {
    await applyForCurrentUrl("document_start");
    setupSpaWatcher();
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === "CFG_PICKER_START") {
        startElementPicker();
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  } catch (err) {
    console.error(PREFIX, "init fail", err);
  }
}

async function getState() {
  const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
  return state || null;
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}

function urlMatches(url, pattern) {
  try {
    const patterns = pattern.includes("://*.") || pattern.includes("://*.")
      ? [pattern, pattern.replace("://*.", "://").replace("://*.", "://").replace("://*.", "://")] // güvenli replace
      : [pattern];
    for (const p of patterns) {
      if (wildcardToRegExp(p).test(url)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function shouldSkipByExclude(url, excludePatterns) {
  if (!Array.isArray(excludePatterns)) return false;
  return excludePatterns.some((p) => urlMatches(url, p));
}

async function applyForCurrentUrl(trigger) {
  const url = location.href;
  lastAppliedUrl = url;
  const state = await getState();
  if (!state?.enabled) return;

  // blocklist/allowlist kontrolü
  const inBlock = Array.isArray(state.blocklist) && state.blocklist.some((p) => urlMatches(url, p));
  if (inBlock) return;
  const inAllow = Array.isArray(state.allowlist) && state.allowlist.some((p) => urlMatches(url, p));
  // allowlist olsa da kuralları uygularız; sadece blocklist engeller

  const rules = Array.isArray(state.rules) ? state.rules.slice() : [];
  rules.sort((a, b) => (a?.priority ?? 0) - (b?.priority ?? 0));

  for (const r of rules) {
    try {
      if (!r?.enabled) continue;
      if (!urlMatches(url, r.pattern)) continue;
      if (shouldSkipByExclude(url, r.excludePatterns)) continue;

      // runAt zamanlaması
      const when = r.runAt || "document_start";
      if (when === "document_start") {
        await applyRule(r, url, state.safeMode === true);
      } else if (when === "document_end") {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => applyRule(r, url, state.safeMode === true), { once: true });
        } else {
          await applyRule(r, url, state.safeMode === true);
        }
      } else {
        // document_idle
        if (document.readyState === "complete") {
          await applyRule(r, url, state.safeMode === true);
        } else {
          const fire = () => applyRule(r, url, state.safeMode === true);
          window.addEventListener("load", fire, { once: true });
          setTimeout(fire, 0);
        }
      }
    } catch (e) {
      console.error(PREFIX, "apply rule error", r?.name, e);
    }
  }
}

async function applyRule(rule, url, safeMode) {
  if (appliedRuleIds.has(rule.id)) return;
  appliedRuleIds.add(rule.id);

  if (safeMode || rule.safeMode) {
    console.info(PREFIX, "safeMode: skip inject", rule.name);
    await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "safe-skip" });
    return;
  }

  // CSS inline
  if (rule.css && rule.css.trim()) {
    try {
      const style = document.createElement("style");
      style.setAttribute("data-cfg-rule", rule.id);
      style.textContent = rule.css;
      (document.head || document.documentElement).appendChild(style);
      await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "css-inline" });
    } catch (e) {
      console.error(PREFIX, "css inline error", e);
    }
  }

  // CSS files
  if (Array.isArray(rule.cssFiles)) {
    for (const f of rule.cssFiles) {
      try {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL(f);
        link.setAttribute("data-cfg-rule", rule.id);
        (document.head || document.documentElement).appendChild(link);
        await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "css-file", meta: f });
      } catch (e) {
        console.error(PREFIX, "css file error", f, e);
      }
    }
  }

  // JS
  const codeParts = [];
  if (rule.js && rule.js.trim()) codeParts.push(rule.js);
  if (Array.isArray(rule.localJs)) {
    for (const lj of rule.localJs) {
      if (lj?.content) codeParts.push(String(lj.content));
    }
  }

  // jsFiles: ISOLATED için fetch edip eval; MAIN için <script src>
  if (Array.isArray(rule.jsFiles)) {
    for (const f of rule.jsFiles) {
      try {
        if (rule.world === "MAIN") {
          const s = document.createElement("script");
          s.src = chrome.runtime.getURL(f);
          s.setAttribute("data-cfg-rule", rule.id);
          (document.head || document.documentElement).appendChild(s);
          s.onload = () => s.remove();
          await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "js-file-main", meta: f });
        } else {
          const resp = await fetch(chrome.runtime.getURL(f));
          const txt = await resp.text();
          codeParts.push(txt);
        }
      } catch (e) {
        console.error(PREFIX, "js file error", f, e);
      }
    }
  }

  if (codeParts.length) {
    try {
      const code = codeParts.join("\n\n");
      if (rule.world === "MAIN") {
        const s = document.createElement("script");
        s.textContent = `(function(){\ntry {\n${code}\n} catch(e){console.error('${PREFIX} js inline main error', e);}\n})();`;
        s.setAttribute("data-cfg-rule", rule.id);
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "js-inline-main" });
      } else {
        try {
          (new Function(code))();
          await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "js-inline-iso" });
        } catch (e) {
          console.error(PREFIX, "js inline iso error", e);
        }
      }
    } catch (e) {
      console.error(PREFIX, "js combine error", e);
    }
  }
}

function setupSpaWatcher() {
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  history.pushState = function() {
    const ret = pushState.apply(this, arguments);
    onUrlMaybeChanged();
    return ret;
  };
  history.replaceState = function() {
    const ret = replaceState.apply(this, arguments);
    onUrlMaybeChanged();
    return ret;
  };
  window.addEventListener("popstate", onUrlMaybeChanged);
  window.addEventListener("hashchange", onUrlMaybeChanged);
}

let urlChangeTimer = null;
function onUrlMaybeChanged() {
  clearTimeout(urlChangeTimer);
  urlChangeTimer = setTimeout(async () => {
    if (location.href === lastAppliedUrl) return;
    appliedRuleIds = new Set();
    await applyForCurrentUrl("spa-change");
  }, 50);
}

async function addLog(entry) {
  try {
    await chrome.runtime.sendMessage({ type: "CFG_LOGS_ADD", entry });
  } catch {}
}

// ===== Element Picker =====
let pickerActive = false;
let pickerOverlay = null;
let pickerLastEl = null;

function startElementPicker() {
  if (pickerActive) return;
  pickerActive = true;

  pickerOverlay = document.createElement("div");
  pickerOverlay.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;`;
  document.documentElement.appendChild(pickerOverlay);

  const outline = document.createElement("div");
  outline.style.cssText = `position:absolute;border:2px solid #22c55e;background:rgba(34,197,94,.15);pointer-events:none;`;
  pickerOverlay.appendChild(outline);

  const onMove = (ev) => {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    pickerLastEl = el;
    const rect = el.getBoundingClientRect();
    outline.style.left = rect.left + window.scrollX + "px";
    outline.style.top = rect.top + window.scrollY + "px";
    outline.style.width = rect.width + "px";
    outline.style.height = rect.height + "px";
  };

  const onClick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    finishPicker();
  };

  const onKey = (ev) => {
    if (ev.key === "Escape") {
      cancelPicker();
    }
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);

  function finishPicker() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    pickerOverlay?.remove();
    pickerOverlay = null;
    pickerActive = false;

    const selector = uniqueCssSelector(pickerLastEl || document.body);
    chrome.runtime.sendMessage({ type: "CFG_PICKER_RESULT", selector, url: location.href }).catch(() => {});
  }

  function cancelPicker() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    pickerOverlay?.remove();
    pickerOverlay = null;
    pickerActive = false;
  }
}

function uniqueCssSelector(el) {
  if (!el || el === document.documentElement) return "html";
  const parts = [];
  while (el && el.nodeType === 1 && el !== document.body) {
    let part = el.nodeName.toLowerCase();
    if (el.id) {
      part += `#${cssEscape(el.id)}`;
      parts.unshift(part);
      break;
    } else {
      const siblingIndex = getElementIndex(el);
      part += `:nth-of-type(${siblingIndex})`;
      if (el.className && typeof el.className === "string") {
        const cl = el.className.trim().split(/\s+/).slice(0, 2).map(cssEscape).join(".");
        if (cl) part += `.${cl}`;
      }
      parts.unshift(part);
      el = el.parentElement;
    }
  }
  return parts.join(" > ");
}

function getElementIndex(el) {
  let i = 1;
  let p = el.previousElementSibling;
  while (p) { if (p.nodeName === el.nodeName) i++; p = p.previousElementSibling; }
  return i;
}

function cssEscape(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}
