const STORE_KEY = "nbc_settings";
const NOTION_BASE = "https://www.notion.so";
const API = (p) => `${NOTION_BASE}/api/v3/${p}`;
const SOUND_PATH = "execute.mp3";

const $ = (id) => document.getElementById(id);
const showError = (msg) => {
  const s = $("status");
  s.textContent = msg || "";
  s.style.display = msg ? "block" : "none";
};

// --- i18n apply (MV3: inline禁止のためJS側で適用) ---
function applyI18n() {
  const getMsg = (k) =>
    (chrome.i18n && typeof chrome.i18n.getMessage === "function")
      ? chrome.i18n.getMessage(k)
      : "";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = getMsg(key);
    if (!msg) return;
    if (el.tagName === "TITLE") {
      document.title = msg;
    } else {
      el.textContent = msg;
    }
  });

  try {
    document.documentElement.lang = (chrome.i18n.getUILanguage() || "en").split("-")[0];
  } catch {}
}

// ---- UIロック/アンロック＆検証 ----
function setControlsEnabled(enabled) {
  ["fetchSpacesBtn","workspaceSelect","dbSelect","closeTabs"].forEach(id => {
    const el = $(id); if (el) el.disabled = !enabled;
  });
}
function validateForm() { $("runBtn").disabled = !Boolean($("workspaceSelect").value); }
function getStore() { return new Promise(r => chrome.storage.sync.get(STORE_KEY, o => r(o[STORE_KEY] || {}))); }
function setStore(v) { return new Promise(r => chrome.storage.sync.set({ [STORE_KEY]: v }, r)); }
function getNotionUserId() {
  return new Promise(res => {
    chrome.cookies.get({ url: NOTION_BASE + "/", name: "notion_user_id" },
      ck => res(ck?.value || null));
  });
}

async function notionPost(path, body, userId) {
  const res = await fetch(API(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-notion-active-user-header": userId || "" },
    body: JSON.stringify(body || {})
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${txt?.slice(0,200)}`);
  try { return JSON.parse(txt); } catch { return {}; }
}

// ---------- Workspaces ----------
async function fetchWorkspaces() {
  const uid = await getNotionUserId();
  if (!uid) throw new Error("Notionにログインしていません。");
  const initBody = { addToSpaceBlockIds: {}, recentSpaceBlockIds: {}, addToBlockProperties: {} };
  const data = await notionPost("getWebClipperData", initBody, uid);

  const wsMap = new Map();
  if (data?.spaces && typeof data.spaces === "object") {
    for (const [id, v] of Object.entries(data.spaces)) {
      const name =
        v?.name || v?.space?.name || data?.spaceNameBySpaceId?.[id] ||
        v?.domain || v?.space?.domain || null;
      wsMap.set(id, { id, name: name || "(no name)", domain: v?.domain || v?.space?.domain || "" });
    }
  } else if (data?.addToSpace?.record?.id) {
    const s = data.addToSpace.record;
    wsMap.set(s.id, { id: s.id, name: s.name || "(no name)", domain: s.domain || "" });
  }

  const strongIds = new Set();
  try {
    const gs = await notionPost("getSpaces", {}, await getNotionUserId());
    const arr = [];
    if (Array.isArray(gs)) { for (const entry of gs) if (Array.isArray(entry?.spaces)) arr.push(...entry.spaces); }
    else if (gs && typeof gs === "object") {
      for (const val of Object.values(gs)) {
        if (Array.isArray(val)) arr.push(...val);
        else if (Array.isArray(val?.spaces)) arr.push(...val.spaces);
      }
    }
    for (const s of arr) {
      if (!s?.id) continue;
      strongIds.add(s.id);
      const rec = wsMap.get(s.id) || { id: s.id };
      if (!rec.name || rec.name === "(no name)") {
        rec.name = s?.name || s?.domain || rec.name || "(no name)";
        rec.domain = s?.domain || rec.domain || "";
      }
      wsMap.set(s.id, rec);
    }
  } catch {}

  try {
    const luc = await notionPost("loadUserContent", {}, await getNotionUserId());
    const sp = luc?.recordMap?.space || {};
    for (const [id, obj] of Object.entries(sp)) {
      strongIds.add(id);
      const val = obj?.value || obj;
      const rec = wsMap.get(id) || { id };
      if (!rec.name || rec.name === "(no name)") {
        rec.name = val?.name || val?.domain || rec.name || "(no name)";
        rec.domain = val?.domain || rec.domain || "";
      }
      wsMap.set(id, rec);
    }
  } catch {}

  const out = [];
  for (const rec of wsMap.values()) {
    const keep = (!!rec.name && rec.name !== "(no name)") || !!rec.domain || strongIds.has(rec.id);
    if (keep) out.push(rec);
  }
  out.sort((a,b) => (a.name || "").localeCompare(b.name || "", "ja"));
  return out;
}

// ---------- Databases ----------
async function fetchDatabases(spaceId) {
  const uid = await getNotionUserId();
  if (!uid) throw new Error("Notionにログインしていません。");
  if (!spaceId) return [];

  const body = { spaceId, query: "", limit: 50 };
  const res = await notionPost("searchWebClipperPages", body, uid);

  const list = res?.results || res?.records || [];
  const dbs = [];
  for (const it of list) {
    const id = it?.id || it?.record?.id || it?.value?.id || it?.block?.id;
    const type = it?.type || it?.record?.type || it?.value?.type || it?.block?.type;
    const name = it?.name || it?.record?.name || it?.value?.name
      || it?.block?.properties?.title?.[0]?.[0];
    if (!id) continue;
    if (type === "collection" || type === "collection_view") {
      dbs.push({ id, title: name || "(no title)" });
    }
  }
  const uniq = new Map();
  for (const d of dbs) if (!uniq.has(d.id)) uniq.set(d.id, d);
  return [...uniq.values()];
}

// ---------- Save ----------
async function saveAll() {
  const spaceId = $("workspaceSelect").value || "";
  const blockId = $("dbSelect").value || "";
  const closeTabs = $("closeTabs").checked;
  await setStore({ spaceId, blockId, closeTabs });
  validateForm();
}

// ---------- PlaySound ----------
function playInTab(tabId) {
  const url = chrome.runtime.getURL(SOUND_PATH);
  return chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (src) => { try { const a = new Audio(src); a.volume = 0.9; a.play().catch(()=>{}); } catch(_){} },
    args: [url]
  });
}

// ---------- 初期化 & イベント ----------
async function bootstrap() {
  showError("");
  setControlsEnabled(false);
  $("runBtn").disabled = true;

  const s = await getStore();

  // 1) ワークスペース
  const spaces = await fetchWorkspaces();
  const wsSel = $("workspaceSelect");
  wsSel.innerHTML = `<option value="">（未選択）</option>` +
    spaces.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join("");
  if (s.spaceId && spaces.some(x => x.id === s.spaceId)) wsSel.value = s.spaceId;

  // 2) DB
  const dbSel = $("dbSelect");
  if (wsSel.value) {
    const dbs = await fetchDatabases(wsSel.value);
    dbSel.innerHTML = `<option value="">（未選択）</option>` +
      dbs.map(d => `<option value="${d.id}">${d.title}</option>`).join("");
    if (s.blockId && dbs.some(x => x.id === s.blockId)) dbSel.value = s.blockId;
  } else {
    dbSel.innerHTML = `<option value="">（未選択）</option>`;
  }

  // 3) チェックボックス
  $("closeTabs").checked = !!s.closeTabs;

  setControlsEnabled(true);
  validateForm();
}

document.addEventListener("DOMContentLoaded", async () => {
  applyI18n();
  try { await bootstrap(); } catch (e) { showError(e.message); }

  // 再取得：変更は即保存
  $("fetchSpacesBtn").onclick = async () => {
    try {
      showError("");
      setControlsEnabled(false);
      const sidBefore = $("workspaceSelect").value;
      const spaces = await fetchWorkspaces();
      const wsSel = $("workspaceSelect");
      wsSel.innerHTML = `<option value="">（未選択）</option>` +
        spaces.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join("");
      if (sidBefore && spaces.some(x => x.id === sidBefore)) wsSel.value = sidBefore;

      const dbSel = $("dbSelect");
      if (wsSel.value) {
        const dbs = await fetchDatabases(wsSel.value);
        dbSel.innerHTML = `<option value="">（未選択）</option>` +
          dbs.map(d => `<option value="${d.id}">${d.title}</option>`).join("");
      } else {
        dbSel.innerHTML = `<option value="">（未選択）</option>`;
      }
      await saveAll();
    } catch (e) { showError(e.message); }
    finally { setControlsEnabled(true); validateForm(); }
  };

  // 変更＝即保存
  $("workspaceSelect").onchange = async () => {
    try {
      showError("");
      setControlsEnabled(false);
      const sid = $("workspaceSelect").value;
      const dbSel = $("dbSelect");
      if (sid) {
        const dbs = await fetchDatabases(sid);
        dbSel.innerHTML = `<option value="">（未選択）</option>` +
          dbs.map(d => `<option value="${d.id}">${d.title}</option>`).join("");
      } else {
        dbSel.innerHTML = `<option value="">（未選択）</option>`;
      }
      await saveAll();
    } catch (e) { showError(e.message); }
    finally { setControlsEnabled(true); validateForm(); }
  };
  $("dbSelect").onchange   = () => { saveAll().catch(e => showError(e.message)); };
  $("closeTabs").onchange  = () => { saveAll().catch(e => showError(e.message)); };

  // 実行：クリップは fire-and-forget（結果は問わない）／音は常時鳴らして即クローズ
  $("runBtn").onclick = () => {
    $("runBtn").disabled = true;
    showError("");

    // クリップ命令（応答は待たない）
    chrome.runtime.sendMessage({ action: "clipNow" });

    // 音を鳴らす：アクティブ→同ウィンドウの http/https タブへ順に注入（どこかで鳴ればOK）
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (act) => {
        const active = act && act[0];
        const tryTargets = [];
        if (active && active.id != null) tryTargets.push(active.id);
        for (const t of tabs) if (/^https?:/i.test(t.url || "")) tryTargets.push(t.id);
        const uniq = [...new Set(tryTargets)].filter(id => id != null);
        for (const tabId of uniq) { try { await playInTab(tabId); break; } catch(_){} }
        window.close();
      });
    });
  };
});
