"use strict";

const STORAGE_KEY = "cfgState";

let state = null;
let rules = [];
let localJsLibrary = [];
let draftRuleCandidate = null;

const els = {
  enabled: document.getElementById("enabled"),
  safeMode: document.getElementById("safeMode"),
  allowlist: document.getElementById("allowlist"),
  blocklist: document.getElementById("blocklist"),
  saveGlobal: document.getElementById("saveGlobal"),
  reload: document.getElementById("reload"),
  globalMsg: document.getElementById("globalMsg"),
  addLocalJs: document.getElementById("addLocalJs"),
  importLocalJsFallback: document.getElementById("importLocalJsFallback"),
  localJsTable: document.getElementById("localJsTable").querySelector("tbody"),
  search: document.getElementById("search"),
  newRule: document.getElementById("newRule"),
  ruleList: document.getElementById("ruleList"),
  ruleForm: document.getElementById("ruleForm"),
  exportJson: document.getElementById("exportJson"),
  importJson: document.getElementById("importJson"),
  importFile: document.getElementById("importFile"),
  previewUrl: document.getElementById("previewUrl"),
  previewBtn: document.getElementById("previewBtn"),
  previewList: document.getElementById("previewList"),
  draftPanel: document.getElementById("draftPanel"),
  draftInfo: document.getElementById("draftInfo"),
  draftEdit: document.getElementById("draftEdit"),
  draftDismiss: document.getElementById("draftDismiss"),
};

init().catch(console.error);

async function init(){
  await loadState();
  bindGlobal();
  renderLocalJs();
  renderRules();
  bindImportExport();
  bindPreview();
  bindDraft();
}

async function loadState(){
  const stored = await chrome.storage.local.get([STORAGE_KEY, "draftRuleCandidate"]);
  state = stored[STORAGE_KEY] || { enabled:true, safeMode:false, version:2, rules:[], allowlist:[], blocklist:[], localJsLibrary:[] };
  draftRuleCandidate = stored.draftRuleCandidate || null;
  rules = Array.isArray(state.rules) ? state.rules.slice() : [];
  localJsLibrary = Array.isArray(state.localJsLibrary) ? state.localJsLibrary.slice() : [];
  els.enabled.checked = !!state.enabled;
  els.safeMode.checked = !!state.safeMode;
  els.allowlist.value = (state.allowlist||[]).join("\n");
  els.blocklist.value = (state.blocklist||[]).join("\n");
}

function bindGlobal(){
  els.saveGlobal.addEventListener("click", async ()=>{
    try {
      const allowlist = els.allowlist.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const blocklist = els.blocklist.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      state.enabled = els.enabled.checked;
      state.safeMode = els.safeMode.checked;
      state.allowlist = allowlist;
      state.blocklist = blocklist;
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      setGlobalMsg("Kaydedildi.");
    } catch (e) { setGlobalMsg("Hata: "+String(e)); }
  });
  els.reload.addEventListener("click", ()=> location.reload());
}

function setGlobalMsg(t){ els.globalMsg.textContent = t; setTimeout(()=> els.globalMsg.textContent = "", 2000); }

function renderLocalJs(){
  els.localJsTable.innerHTML = "";
  for (const item of localJsLibrary){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.title)}</td>
      <td>${item.size}</td>
      <td class="small" style="max-width:220px;word-break:break-all;">${item.hash}</td>
      <td class="small">${new Date(item.lastImportedAt||0).toLocaleString()}</td>
      <td>
        <button data-act="refresh" data-id="${item.id}">Yenile</button>
        <button class="danger" data-act="remove" data-id="${item.id}">Sil</button>
      </td>
    `;
    tr.addEventListener("click", async (ev)=>{
      const btn = ev.target.closest("button"); if(!btn) return;
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      if (act === "remove"){
        localJsLibrary = localJsLibrary.filter(x=> x.id !== id);
        state.localJsLibrary = localJsLibrary;
        await chrome.storage.local.set({ [STORAGE_KEY]: state });
        renderLocalJs();
      } else if (act === "refresh"){
        await fallbackPickAndReplace(id);
      }
    });
    els.localJsTable.appendChild(tr);
  }
  els.addLocalJs.onclick = pickAndImportLocalJs;
  els.importLocalJsFallback.onclick = fallbackImportLocalJs;
}

async function pickAndImportLocalJs(){
  if (!window.showOpenFilePicker) return fallbackImportLocalJs();
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description:"JavaScript", accept: { "application/javascript":[".js"], "text/javascript":[".js"], "text/plain":[".js"] } }] });
    const file = await handle.getFile();
    const text = await file.text();
    const hash = await sha256base16(text);
    const item = {
      id: cryptoId(),
      title: file.name,
      lastImportedAt: Date.now(),
      size: file.size,
      hash,
      handleId: null,
      content: text
    };
    localJsLibrary.push(item);
    state.localJsLibrary = localJsLibrary;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    renderLocalJs();
  } catch (e) { alert("Hata: "+String(e)); }
}

async function fallbackImportLocalJs(){
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".js";
  input.onchange = async () => {
    const file = input.files?.[0]; if(!file) return;
    const text = await file.text();
    const hash = await sha256base16(text);
    const item = { id: cryptoId(), title: file.name, lastImportedAt: Date.now(), size: file.size, hash, handleId: null, content: text };
    localJsLibrary.push(item); state.localJsLibrary = localJsLibrary;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    renderLocalJs();
  };
  input.click();
}

async function fallbackPickAndReplace(id){
  const idx = localJsLibrary.findIndex(x=> x.id === id); if (idx<0) return;
  const input = document.createElement("input"); input.type = "file"; input.accept = ".js";
  input.onchange = async ()=>{
    const file = input.files?.[0]; if(!file) return;
    const text = await file.text();
    const hash = await sha256base16(text);
    localJsLibrary[idx] = { ...localJsLibrary[idx], lastImportedAt: Date.now(), size: file.size, hash, content: text };
    state.localJsLibrary = localJsLibrary;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    renderLocalJs();
  };
  input.click();
}

function renderRules(){
  const q = (els.search.value||"").toLowerCase();
  els.ruleList.innerHTML = "";
  const sorted = rules.slice().sort((a,b)=> (a.priority??0)-(b.priority??0));
  const filtered = sorted.filter(r => !q || (r.name||"").toLowerCase().includes(q) || (r.pattern||"").toLowerCase().includes(q));
  for (const r of filtered){
    const card = document.createElement("div");
    card.className = "card";
    const inlineJsWarn = r.__inlineJsDeprecated ? `<div class="small" style="color:#fca5a5;">Uyarı: Bu kuralda eski inline JS var, artık uygulanmayacak.</div>` : "";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div><strong>${escapeHtml(r.name)}</strong> <span class="badge">${r.world}</span> <span class="badge">p=${r.priority??0}</span></div>
        <div class="row">
          <label class="small">Açık <input type="checkbox" ${r.enabled?"checked":""} data-act="toggle" data-id="${r.id}"></label>
          <button data-act="edit" data-id="${r.id}">Düzenle</button>
          <button class="danger" data-act="del" data-id="${r.id}">Sil</button>
        </div>
      </div>
      <div class="small">${escapeHtml(r.pattern)}</div>
      ${inlineJsWarn}
    `;
    card.addEventListener("click", async (ev)=>{
      const btn = ev.target.closest("button, input[type=checkbox]"); if(!btn) return;
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      if (act === "toggle"){
        const idx = rules.findIndex(x=> x.id === id); if (idx<0) return;
        rules[idx].enabled = btn.checked;
        await saveRules();
        renderRules();
      } else if (act === "edit"){
        openRuleEditor(rules.find(x=> x.id === id));
      } else if (act === "del"){
        if (confirm("Silinsin mi?")){
          rules = rules.filter(x=> x.id !== id);
          await saveRules();
          renderRules();
        }
      }
    });
    els.ruleList.appendChild(card);
  }
  els.newRule.onclick = ()=> openRuleEditor(defaultRule());
  els.search.oninput = ()=> renderRules();
}

function openRuleEditor(rule){
  els.ruleForm.style.display = "block";
  els.ruleForm.innerHTML = ruleFormHtml(rule);
  bindRuleForm(rule);
  els.ruleForm.scrollIntoView({ behavior:"smooth" });
}

function ruleFormHtml(r){
  const jsReadonly = (r.__inlineJsDeprecated || (r.js && r.js.trim())) ? `<div class="small" style="color:#fca5a5;">Inline JS kullanım dışı. İçerik yalnız görüntülenir.</div>` : "";
  return `
  <div class="col">
    <h4>Kural Düzenle</h4>
    <label>İsim <input type="text" id="f_name" value="${escapeAttr(r.name)}"></label>
    <div class="row">
      <label class="small">Açık <input type="checkbox" id="f_enabled" ${r.enabled?"checked":""}></label>
      <label>Öncelik <input type="number" id="f_priority" value="${r.priority??100}"></label>
      <label>RunAt
        <select id="f_runAt">
          ${opt("document_start", r.runAt)}
          ${opt("document_end", r.runAt)}
          ${opt("document_idle", r.runAt)}
        </select>
      </label>
      <label>World
        <select id="f_world">
          ${opt("ISOLATED", r.world)}
          ${opt("MAIN", r.world)}
        </select>
      </label>
      <label>Scope
        <select id="f_scope">
          ${opt("DOMAIN", r.scope)}
          ${opt("URL", r.scope)}
          ${opt("PATTERN", r.scope)}
        </select>
      </label>
    </div>
    <label>Pattern <input type="text" id="f_pattern" value="${escapeAttr(r.pattern)}"></label>
    <label>Exclude Patterns (satır satır)
      <textarea id="f_excludePatterns">${(r.excludePatterns||[]).join("\n")}</textarea>
    </label>
    <label>Inline CSS
      <textarea id="f_css">${escapeText(r.css||"")}</textarea>
    </label>
    <label>CSS Files (virgülle)
      <input type="text" id="f_cssFiles" value="${escapeAttr((r.cssFiles||[]).join(", "))}">
    </label>
    <div class="panel">
      <div><strong>Inline JS (deprecated)</strong></div>
      ${jsReadonly}
      <textarea id="f_js" readonly>${escapeText(r.js||"")}</textarea>
    </div>
    <label>JS Files (paket içi, virgülle)
      <input type="text" id="f_jsFiles" value="${escapeAttr((r.jsFiles||[]).join(", "))}">
    </label>
    <label>Safe Actions (JSON)
      <textarea id="f_safeActions">${escapeText(JSON.stringify(r.safeActions||{}, null, 2))}</textarea>
    </label>
    <label>Yerel JS (kütüphaneden seç)
      <select id="f_localJs" multiple>${localJsOptions(r.localJs||[])}</select>
    </label>
    <label class="small">Safe Mode <input type="checkbox" id="f_safeMode" ${r.safeMode?"checked":""}></label>
    <label>Notlar <textarea id="f_notes">${escapeText(r.notes||"")}</textarea></label>
    <div class="row">
      <button id="f_save">Kaydet</button>
      <button class="secondary" id="f_cancel">Kapat</button>
    </div>
  </div>`;
}

function bindRuleForm(orig){
  const getVal = (id)=> document.getElementById(id).value;
  const getChecked = (id)=> document.getElementById(id).checked;
  document.getElementById("f_cancel").onclick = ()=> els.ruleForm.style.display = "none";
  document.getElementById("f_save").onclick = async ()=>{
    let parsedSafe = {};
    try { parsedSafe = JSON.parse(getVal("f_safeActions")||"{}"); } catch { alert("Safe Actions JSON geçersiz"); return; }
    const updated = {
      id: orig.id || cryptoId(),
      name: getVal("f_name"),
      enabled: getChecked("f_enabled"),
      pattern: getVal("f_pattern"),
      excludePatterns: (document.getElementById("f_excludePatterns").value||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
      scope: getVal("f_scope"),
      priority: parseInt(getVal("f_priority"))||100,
      runAt: getVal("f_runAt"),
      world: getVal("f_world"),
      css: document.getElementById("f_css").value,
      cssFiles: splitCsv(document.getElementById("f_cssFiles").value),
      js: orig.js || "", // inline JS korunur ama kullanılmaz
      jsFiles: splitCsv(document.getElementById("f_jsFiles").value),
      localJs: getSelectedLocalJsFromForm(),
      safeActions: parsedSafe,
      safeMode: getChecked("f_safeMode"),
      notes: document.getElementById("f_notes").value,
      __inlineJsDeprecated: orig.__inlineJsDeprecated || (orig.js && orig.js.trim()? true : false)
    };
    const idx = rules.findIndex(x=> x.id === updated.id);
    if (idx>=0) rules[idx] = updated; else rules.push(updated);
    await saveRules();
    els.ruleForm.style.display = "none";
    renderRules();
  };
}

function getSelectedLocalJsFromForm(){
  const sel = document.getElementById("f_localJs");
  const ids = Array.from(sel.selectedOptions).map(o=> o.value);
  return localJsLibrary.filter(x=> ids.includes(x.id)).map(x=> ({
    title: x.title,
    lastImportedAt: x.lastImportedAt,
    size: x.size,
    hash: x.hash,
    handleId: x.handleId || null,
    content: x.content
  }));
}

function localJsOptions(selected){
  const selIds = new Set((selected||[]).map(x=> x.hash ? x.hash : x.title));
  return localJsLibrary.map(item=> `<option value="${item.id}" ${selIds.has(item.hash||item.title)?"selected":""}>${escapeHtml(item.title)} (${item.size}B)</option>`).join("");
}

async function saveRules(){
  state.rules = rules;
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function defaultRule(){
  return { id: cryptoId(), name: "Yeni Kural", enabled: true, pattern: "*://*/*", excludePatterns: [], scope: "DOMAIN", priority: 100, runAt: "document_start", world: "ISOLATED", css: "", cssFiles: [], js: "", jsFiles: [], localJs: [], safeActions: {}, safeMode: false, notes: "" };
}

function splitCsv(s){ return (s||"").split(",").map(x=>x.trim()).filter(Boolean); }
function opt(v, cur){ return `<option value="${v}" ${v===cur?"selected":""}>${v}</option>`; }
function escapeHtml(s){ return (s||"").replace(/[&<>]/g, c=> ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function escapeAttr(s){ return (s||"").replace(/"/g, '&quot;'); }
function escapeText(s){ return (s||"").replace(/</g, '&lt;'); }
function cryptoId(){ const a=new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join(''); }

function wildcardToRegExp(pattern){
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}
function urlMatches(url, pattern){ try { return wildcardToRegExp(pattern).test(url); } catch { return false; } }
function shouldSkipByExclude(url, excludePatterns){ if(!Array.isArray(excludePatterns)) return false; return excludePatterns.some(p=> urlMatches(url,p)); }

async function sha256base16(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=> b.toString(16).padStart(2,'0')).join('');
}
