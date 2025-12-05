"use strict";

const STORAGE_KEY = "cfgState";

const els = {
  urlInfo: document.getElementById("urlInfo"),
  scope: document.getElementById("scope"),
  world: document.getElementById("world"),
  css: document.getElementById("css"),
  jsFiles: document.getElementById("jsFiles"),
  safeActions: document.getElementById("safeActions"),
  localJsSelect: document.getElementById("localJsSelect"),
  applyNow: document.getElementById("applyNow"),
  saveRule: document.getElementById("saveRule"),
  openOptions: document.getElementById("openOptions"),
  msg: document.getElementById("msg"),
  matches: document.getElementById("matches"),
  matchCount: document.getElementById("matchCount"),
  logs: document.getElementById("logs")
};

let active = { url: null, tabId: null };
let state = null;
let editingRuleId = null;

init().catch(console.error);

async function init() {
  // static alanları kullan

  active = await chrome.runtime.sendMessage({ type: "CFG_GET_ACTIVE_TAB_URL" });
  els.urlInfo.textContent = `Aktif sekme: ${active.url || "-"}`;

  const stored = await chrome.storage.local.get([STORAGE_KEY, "draftRuleCandidate"]);
  state = stored[STORAGE_KEY] || { rules: [], localJsLibrary: [], logs: [] };

  refreshLocalJsSelect();

  if (!stored.draftRuleCandidate) {
    const matched = getMatchedRules(active.url, state.rules);
    if (matched.length) prefillFromRule(matched[0]);
  }

  renderMatches();
  renderLogs();

  if (stored.draftRuleCandidate) {
    // Kural birleştirme mantığı:
    // Eğer aynı pattern'e sahip (ve enabled) bir kural varsa, onun üzerine ekle.
    const candidate = stored.draftRuleCandidate;
    const existingRule = state.rules.find(r => r.pattern === candidate.pattern && r.scope === candidate.scope);

    if (existingRule) {
      // Mevcut kuralı düzenleme moduna al
      editingRuleId = existingRule.id;
      
      // CSS birleştir
      const newCss = candidate.css || "";
      const oldCss = existingRule.css || "";
      // Eğer yeni CSS zaten varsa ekleme
      if (!oldCss.includes(newCss.trim())) {
        els.css.value = oldCss ? `${oldCss}\n${newCss}` : newCss;
      } else {
        els.css.value = oldCss;
      }

      // Diğer alanları mevcut kuraldan koru, ancak yeni safeActions varsa birleştirilebilir (basitlik için şimdilik CSS odaklı)
      els.world.value = existingRule.world || "ISOLATED";
      els.scope.value = existingRule.scope || "DOMAIN";
      els.jsFiles.value = (existingRule.jsFiles||[]).join(", ");
      
      // Safe Actions birleştirme (basitçe merge)
      const sa = existingRule.safeActions || {};
      const newSa = candidate.safeActions || {};
      const mergedSa = { ...sa };
      if (newSa.hide && Array.isArray(newSa.hide)) {
        const oldHide = Array.isArray(sa.hide) ? sa.hide : [];
        mergedSa.hide = Array.from(new Set([...oldHide, ...newSa.hide]));
      }
      els.safeActions.value = JSON.stringify(mergedSa, null, 2);

      setMsg("Mevcut kural ile birleştirildi.");
    } else {
      // Yeni kural
      els.css.value = candidate.css || "";
      els.world.value = candidate.world || "ISOLATED";
      els.scope.value = candidate.scope || "DOMAIN";
      const sa = candidate.safeActions || {};
      const mergedSa = { ...sa };
      if (sa.hide && Array.isArray(sa.hide)) {
        mergedSa.hide = Array.from(new Set(sa.hide));
      }
      els.safeActions.value = JSON.stringify(mergedSa, null, 2);
      editingRuleId = null; 
    }
    await chrome.storage.local.remove("draftRuleCandidate");
  }

  els.applyNow.addEventListener("click", onApplyNow);
  els.saveRule.addEventListener("click", onSaveRule);
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function refreshLocalJsSelect() {
  const lib = Array.isArray(state.localJsLibrary) ? state.localJsLibrary : [];
  els.localJsSelect.innerHTML = "";
  for (const item of lib) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = `${item.title} (${item.size}B)`;
    els.localJsSelect.appendChild(opt);
  }
}

function getMatchedRules(url, rules) {
  const arr = Array.isArray(rules) ? rules : [];
  return arr.filter(r => r.enabled && urlMatches(url, r.pattern)).sort((a,b)=> (a.priority??0)-(b.priority??0));
}

function prefillFromRule(rule){
  editingRuleId = rule.id;
  els.css.value = rule.css || "";
  els.world.value = rule.world || "ISOLATED";
  els.scope.value = rule.scope || "DOMAIN";
  els.jsFiles.value = (rule.jsFiles||[]).join(", ");
  els.safeActions.value = JSON.stringify(rule.safeActions||{}, null, 2);
  setMsg("Mevcut kural yüklendi.");
}

function getEditingBaseRule(){
  if (!editingRuleId) return null;
  const rules = Array.isArray(state.rules) ? state.rules : [];
  return rules.find(r => r.id === editingRuleId) || null;
}

function getPatternForScope(url, scope) {
  try {
    const u = new URL(url);
    if (scope === "URL") return u.href;
    if (scope === "DOMAIN") {
      const host = u.hostname.startsWith("www.") ? u.hostname.slice(4) : u.hostname;
      return `*://*.${host}/*`;
    }
    return "*://*/*"; // PATTERN serbest
  } catch {
    return "*://*/*";
  }
}

function getSelectedLocalJs() {
  const ids = Array.from(els.localJsSelect.selectedOptions).map(o => o.value);
  const lib = state.localJsLibrary || [];
  return lib.filter(x => ids.includes(x.id)).map(x => ({
    title: x.title,
    lastImportedAt: x.lastImportedAt,
    size: x.size,
    hash: x.hash,
    handleId: x.handleId || null,
    content: x.content
  }));
}

async function onApplyNow() {
  const rule = buildRuleDraft();
  try {
    await chrome.runtime.sendMessage({ type: "CFG_APPLY_NOW", tabId: active.tabId, rule });
    setMsg("Uygulandı.");
  } catch (e) {
    setMsg("Hata: " + String(e));
  }
}

async function onSaveRule() {
  const draft = buildRuleDraft();
  try {
    const { [STORAGE_KEY]: st } = await chrome.storage.local.get(STORAGE_KEY);
    const list = Array.isArray(st?.rules) ? st.rules.slice() : [];
    if (editingRuleId) {
      const idx = list.findIndex(x => x.id === editingRuleId);
      if (idx >= 0) list[idx] = draft; else list.push(draft);
      setMsg("Güncellendi.");
    } else {
      list.push(draft);
      setMsg("Kaydedildi. Options'tan yönetebilirsiniz.");
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...st, rules: list } });
    state.rules = list;
    renderMatches();
  } catch (e) {
    setMsg("Hata: " + String(e));
  }
}

function buildRuleDraft() {
  const base = editingRuleId ? getEditingBaseRule() : null;
  const pattern = base?.pattern || getPatternForScope(active.url, els.scope.value);
  let parsedSafe = {};
  try { parsedSafe = JSON.parse(els.safeActions.value||"{}"); } catch { parsedSafe = {}; }
  return {
    id: base?.id || cryptoRandomId(),
    name: base?.name || "Popup kuralı",
    enabled: base?.enabled !== false,
    pattern,
    excludePatterns: Array.isArray(base?.excludePatterns) ? base.excludePatterns : [],
    scope: base?.scope || els.scope.value,
    priority: typeof base?.priority === 'number' ? base.priority : 100,
    runAt: base?.runAt || "document_start",
    world: els.world.value,
    css: els.css.value,
    cssFiles: Array.isArray(base?.cssFiles) ? base.cssFiles : [],
    jsFiles: (els.jsFiles.value||"").split(",").map(s=>s.trim()).filter(Boolean),
    localJs: getSelectedLocalJs(),
    safeActions: parsedSafe,
    safeMode: !!base?.safeMode,
    notes: base?.notes || ""
  };
}

function setMsg(t) { els.msg.textContent = t; setTimeout(()=> els.msg.textContent = "", 2000); }

function renderMatches() {
  els.matches.innerHTML = "";
  const rules = Array.isArray(state.rules) ? state.rules : [];
  const url = active.url || "";
  const matched = rules.filter(r => r.enabled && urlMatches(url, r.pattern));
  els.matchCount.textContent = `${matched.length}`;
  matched.sort((a,b)=> (a.priority??0)-(b.priority??0));
  for (const r of matched) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div><strong>${escapeHtml(r.name)}</strong> <span class="badge">${r.world}</span></div>
        <div class="row">
          <button data-act="load" data-id="${r.id}">Yükle</button>
          <label class="small" style="margin-left:8px;">Açık <input type="checkbox" ${r.enabled?"checked":""} data-act="toggle" data-id="${r.id}"></label>
        </div>
      </div>
      <div class="small">${escapeHtml(r.pattern)}</div>
    `;
    card.addEventListener("click", async (ev)=>{
      const btn = ev.target.closest("button, input[type=checkbox]"); if(!btn) return;
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      const { [STORAGE_KEY]: st } = await chrome.storage.local.get(STORAGE_KEY);
      const list = Array.isArray(st?.rules) ? st.rules.slice() : [];
      const idx = list.findIndex(x=> x.id === id);
      if (act === "toggle" && idx>=0){
        list[idx].enabled = btn.checked;
        await chrome.storage.local.set({ [STORAGE_KEY]: { ...st, rules: list } });
        state.rules = list; renderMatches();
      }
      if (act === "load" && idx>=0){
        prefillFromRule(list[idx]);
      }
    });
    els.matches.appendChild(card);
  }
}

function renderLogs(){
  const logs = Array.isArray(state.logs)? state.logs.slice(-20) : [];
  els.logs.innerHTML = "";
  for (const l of logs.reverse()){
    const div = document.createElement("div");
    const time = new Date(l.ts||0).toLocaleTimeString();
    div.textContent = `${time} • ${l.action||"-"} • ${l.name||l.ruleId||"?"}`;
    els.logs.appendChild(div);
  }
}
