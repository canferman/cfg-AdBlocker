"use strict";

// cfg-AdBlocker content script
// - Kuralları storage'dan alır ve URL'ye göre uygular
// - CSS/JS enjeksiyon (css inline + cssFiles, jsFiles), inline JS KALDIRILDI
// - Safe Actions (hide/remove/click/setAttr/waitFor)
// - SPA URL değişimi izleme + kozmetik temizlik (Google Ads overlay/iframe)

const STORAGE_KEY = "cfgState";
const PREFIX = "[cfg-AdBlocker]";

let appliedRuleIds = new Set();
let lastAppliedUrl = location.href;

init().catch((e) => console.error(PREFIX, "init error", e));

async function init() {
  try {
    addCosmeticCleaner();
    addGmailSponsoredCleaner();
    await applyForCurrentUrl("document_start");
    setupSpaWatcher();
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === "CFG_PICKER_START") {
        startElementPicker();
        sendResponse({ ok: true });
        return true;
      }
      if (msg?.type === "CFG_APPLY_SAFE_ACTIONS_NOW") {
        runSafeActions(msg.safeActions).then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e)}));
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
      ? [pattern, pattern.replace("://*.", "://").replace("://*.", "://").replace("://*.", "://")] 
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

  // JS files (paket içi)
  if (Array.isArray(rule.jsFiles) && rule.jsFiles.length) {
    try {
      await chrome.runtime.sendMessage({ type: "CFG_EXECUTE_JS_FILES", files: rule.jsFiles, world: rule.world || "ISOLATED" });
      await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "js-files" });
    } catch (e) {
      console.error(PREFIX, "js files exec error", e);
    }
  }

  // Safe Actions
  if (rule.safeActions && typeof rule.safeActions === 'object') {
    try {
      await runSafeActions(rule.safeActions);
      await addLog({ ts: Date.now(), url, ruleId: rule.id, name: rule.name, action: "safe-actions" });
    } catch (e) {
      console.error(PREFIX, "safe actions error", e);
    }
  }
}

async function runSafeActions(safe){
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const qAll = (sel)=> Array.from(document.querySelectorAll(sel));
  const isStrArr = (a)=> Array.isArray(a) && a.every(x=> typeof x === 'string');

  if (isStrArr(safe.hide)) safe.hide.forEach(sel=> qAll(sel).forEach(el=> el.style.setProperty('display','none','important')));
  if (isStrArr(safe.remove)) safe.remove.forEach(sel=> qAll(sel).forEach(el=> el.remove()));
  if (isStrArr(safe.click)) safe.click.forEach(sel=> qAll(sel).forEach(el=> el.click?.()));
  if (Array.isArray(safe.setAttr)) safe.setAttr.forEach(x=> qAll(x.selector||'').forEach(el=> el.setAttribute(x.name||'', x.value||'')));
  if (Array.isArray(safe.waitFor)){
    for (const w of safe.waitFor){
      const timeout = Math.max(0, Number(w.timeoutMs||3000));
      const start = performance.now();
      while (performance.now() - start < timeout){ if (document.querySelector(w.selector)) break; await sleep(50); }
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

// ===== Kozmetik Temizlik (Google Ads overlay/iframe) =====
function addCosmeticCleaner(){
  const LOG = (...a)=> console.debug(PREFIX, ...a);
  const INS = 'ins[id^="gpt_unit_"]';
  const OVERLAY = [
    '[class*="overlay"]','[id*="overlay"]',
    '[class*="interstitial"]','[id*="interstitial"]',
    '[class*="modal"]','[id*="modal"]',
    '[class*="backdrop"]','[id*="backdrop"]',
    '[role="dialog"]','[aria-modal="true"]'
  ].join(",");
  const isEl = (n)=> n && n.nodeType === 1;
  const findWrap = (el)=> el.closest(OVERLAY) || el.closest('*[style*="z-index"]') || el;
  const remove = (n)=> { try{ isEl(n) && n.remove(); return true; } catch { return false; } };
  const unlock = ()=>{
    const b=document.body, h=document.documentElement;
    if (b){ b.style.overflow="visible"; b.style.position=""; b.style.height=""; b.style.pointerEvents=""; b.style.userSelect=""; }
    if (h){ h.style.overflow="visible"; }
  };
  const purge = (root=document.documentElement)=>{
    if(!isEl(root)) return;
    let hit=false;
    if (root.matches?.(INS)) { if (remove(findWrap(root))||remove(root)) hit=true; }
    root.querySelectorAll?.(INS).forEach(ins=>{ if (remove(findWrap(ins))||remove(ins)) hit=true; });
    root.querySelectorAll?.('iframe[src*="googlesyndication"],iframe[src*="doubleclick"],iframe[id*="google_ads_iframe"]').forEach(ifr=>{
      if(remove(ifr.closest(OVERLAY)||ifr)) hit=true;
    });
    if (hit){ unlock(); LOG("ad overlay removed"); }
  };
  purge();
  new MutationObserver((muts)=>{
    for(const m of muts){
      m.addedNodes?.forEach(n=>purge(n));
      if (m.type==="attributes" && m.target.matches?.(INS)) purge(m.target);
    }
  }).observe(document.documentElement,{ childList:true, subtree:true, attributes:true, attributeFilter:["id","class","style"] });
  const _attachShadow = Element.prototype.attachShadow;
  if (_attachShadow && !_attachShadow.__cfgHooked){
    Element.prototype.attachShadow = function(init){
      const s = _attachShadow.call(this, init);
      new MutationObserver((muts)=>muts.forEach(m=>m.addedNodes?.forEach(n=>purge(n))))
        .observe(s,{ childList:true, subtree:true });
      return s;
    };
    Element.prototype.attachShadow.__cfgHooked = true;
  }
  setInterval(()=>purge(),3000);
}

// Gmail sponsorlu satır temizleyici (varsayılan)
function addGmailSponsoredCleaner(){
  if (!/mail\.google\.com$/.test(location.hostname)) return;
  const LOG = (...a)=> console.debug(PREFIX, ...a);
  const isEl = (n)=> n && n.nodeType === 1;
  const isRow = (el)=> isEl(el) && el.matches && el.matches('tr.zA, div.zA');
  const isSponsoredRow = (row)=>{
    try {
      if (row.querySelector('[aria-label="Reklam bilgileri"]')) return true;
      const t = (row.textContent||"").trim();
      if (/\bSponsorlu\b/i.test(t) || /\bSponsored\b/i.test(t) || /\bReklam\b/i.test(t)) {
        if (row.querySelector('span.ast')) return true; // "Reklam" etiketi
        if (row.querySelector('.bGY')) return true;    // Sponsorlu etiket sınıfları
        if (row.querySelector('.afn')) return true;    // Üst açıklama satırı
        return true;
      }
      return false;
    } catch { return false; }
  };
  const removeRow = (row)=> { try { row.style.display = 'none'; return true; } catch { return false; } };
  const purgeGmail = (root=document.documentElement)=>{
    if (!isEl(root)) return;
    let hits = 0;
    const candidates = [];
    if (isRow(root)) candidates.push(root);
    root.querySelectorAll?.('tr.zA, div.zA').forEach(r=> candidates.push(r));
    for (const r of candidates){
      if (isSponsoredRow(r)) { if (removeRow(r)) hits++; }
    }
    if (hits) LOG('gmail sponsored removed:', hits);
  };
  purgeGmail();
  new MutationObserver((muts)=>{
    for (const m of muts){ m.addedNodes?.forEach(n=> purgeGmail(n)); }
  }).observe(document.documentElement, { childList:true, subtree:true });
  setInterval(()=> purgeGmail(), 3000);
}

// ===== Element Picker (değişmedi) =====
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
