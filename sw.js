const STORE_KEY = "nbc_settings";
const NOTION_BASE = "https://www.notion.so";
const API = (path) => `${NOTION_BASE}/api/v3/${path}`;

/* storage */
async function getSettings() {
  return new Promise((resolve) => chrome.storage.sync.get(STORE_KEY, (obj) => resolve(obj[STORE_KEY] || {})));
}

/* cookies */
async function getNotionUserId() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: `${NOTION_BASE}/`, name: "notion_user_id" },
      (ck) => resolve(ck?.value || null)
    );
  });
}

/* Notion API */
async function notionPost(path, body, notionUserId) {
  const res = await fetch(API(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-notion-active-user-header": notionUserId || ""
    },
    body: JSON.stringify(body || {})
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status}: ${t?.slice(0, 200)}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();

  const txt = await res.text().catch(() => "");
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

/* すべてのタブを一括クリップ（http/httpsのみ）→ 保存できたタブだけを一括クローズ */
async function clipAllTabs() {
  const [settings, notionUserId] = await Promise.all([getSettings(), getNotionUserId()]);
  if (!notionUserId) throw new Error("Notionにログインしていません。");

  const { spaceId, blockId, closeTabs } = settings || {};
  if (!spaceId) throw new Error("spaceId が未設定です。");

  // 1) 対象タブ抽出（http/https のみ）
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const httpTabs = allTabs.filter((t) => /^https?:/i.test(t.url || "")).filter((t) => !isLocalhostUrl(t.url || ""));
  if (!httpTabs.length) throw new Error("保存対象タブがありません。");

  // 2) Notionへ一括投入（WebClipper互換）
  const items = httpTabs.map((t) => ({ url: t.url, title: t.title || "" }));
  const body = blockId
    ? { type: "block", blockId, spaceId, items, from: "chrome" }
    : { type: "create_collection", spaceId, name: "My Links", iconEmoji: "🔗", items, from: "chrome" };

  await notionPost("addWebClipperURLs", body, notionUserId);

  // 3) 保存できた http/https タブのみを “1エントリ” として閉じる（履歴から一括復元可）
  if (closeTabs) {
    const savedIds = httpTabs.map((t) => t.id).filter((id) => id !== undefined);

    try {
      const first = savedIds[0];
      const newWin = await chrome.windows.create({ tabId: first, focused: false });
      const rest = savedIds.slice(1);
      if (rest.length) await chrome.tabs.move(rest, { windowId: newWin.id, index: -1 });
      await chrome.windows.remove(newWin.id);
    } catch {
      // フォールバック：まとめて閉じる（履歴のまとまりが弱くなる可能性）
      await chrome.tabs.remove(savedIds);
    }
  }
}

/* localhostを検出する */
function isLocalhostUrl(url) {
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/* popup からの実行要求（UI は sendMessage の応答を待って結果を表示する） */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "clipNow") {
    clipAllTabs()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true; // 非同期応答
  }
});

/* 起動時にバッジ初期化（任意） */
self.addEventListener("activate", () => {
  chrome.action.setBadgeText({ text: "" });
});
