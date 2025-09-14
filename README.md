# Notion Batch Clipper

**Batch-clip all tabs in the current window to Notion** — no personal API token required.  
It uses Notion’s Web Clipper–compatible private endpoints from the logged-in browser session.  
Only `http/https` tabs are saved; non-`http/https` tabs are **skipped and kept open**. Optionally, the saved tabs are **closed in a single history entry** for easy restore. :contentReference[oaicite:0]{index=0}

> UI supports i18n (EN/JA). Text is swapped via `chrome.i18n` at runtime; no inline scripts (MV3 CSP-friendly). 

---

## Features

- **One-click batch clipping** of all `http/https` tabs in the current window to a chosen Notion database (or a new collection if none selected). :contentReference[oaicite:2]{index=2}
- **Workspace & database selectors** (dropdowns), with **settings persisted** (`workspace`, `database`, `close tabs`). 
- **Optional auto-close**: closes only the tabs that were saved, and does so as **one history entry** for quick mass-restore. :contentReference[oaicite:4]{index=4}
- **Click sound** on execution (injected audio; no inline code). Popup closes immediately after click. :contentReference[oaicite:5]{index=5}
- **MV3, CSP-safe** (no inline scripts), minimal permissions, background service worker as ES module. :contentReference[oaicite:6]{index=6}
- **Lightweight UI** styled to resemble Web Clipper tone. :contentReference[oaicite:7]{index=7}

---

## How it works (high level)

- The extension reads the Notion login cookie (`notion_user_id`) and calls Notion’s **private** API under `https://www.notion.so/api/v3/`, specifically:
  - `getWebClipperData` / `getSpaces` / `loadUserContent` for workspace discovery (popup),
  - `searchWebClipperPages` for recent clip destinations (popup),
  - `addWebClipperURLs` to enqueue the URLs of the open tabs (service worker). 
- Only `http/https` tabs are submitted; others are skipped. If “close tabs after saving” is enabled, only the saved tabs are closed, grouped so the browser history can restore them **all at once**. :contentReference[oaicite:9]{index=9}

> **Note:** These `/api/v3` endpoints are **undocumented / private** and may change without notice.

---

## Install (Developer Mode)

1. **Clone** this repo and open `chrome://extensions`.
2. Toggle **Developer mode** → **Load unpacked** → Select the project folder.
3. Ensure files are present:
   - `manifest.json` (MV3, background set as `type: "module"`) :contentReference[oaicite:10]{index=10}
   - `popup.html`, `popup.css`, `popup.js` (no inline scripts; i18n applied at runtime) 
   - `sw.js` (service worker) :contentReference[oaicite:12]{index=12}
   - `execute.mp3` (click sound; declared as web-accessible resource) :contentReference[oaicite:13]{index=13}
   - Toolbar icons (e.g. `icon-32.png`, `icon-128.png`) referenced by manifest. :contentReference[oaicite:14]{index=14}

> On first use, open **notion.so** and sign in (cookie required). Then click the extension.

---

## Usage

1. Click the extension icon.
2. (Popup) **Refresh Info** if needed, select **Workspace** and **Destination Database**, and toggle **Close tabs after saving**. Selections are saved automatically. 
3. Press **Run** → you’ll hear a short sound and the popup closes immediately.  
   The service worker submits all `http/https` tabs; if enabled, those tabs are then closed in one history group. 

---

## Internationalization (i18n)

- `manifest.json` uses `default_locale: "en"`. Add `_locales/<lang>/messages.json` files as needed. Chrome auto-selects the closest language; if missing, it falls back to English. :contentReference[oaicite:17]{index=17}
- The popup marks translatable nodes with `data-i18n="key"` and replaces them on `DOMContentLoaded` using `chrome.i18n.getMessage`. No inline scripts are used; all logic lives in `popup.js`. 

---

## Permissions (why they’re needed)

- `tabs`: enumerate tabs in the current window; close/move them after saving. :contentReference[oaicite:19]{index=19}  
- `cookies`: read `notion_user_id` to act as the logged-in user. :contentReference[oaicite:20]{index=20}  
- `activeTab` + `scripting`: inject a tiny audio player into the active (or any http/https) tab to play the click sound.   
- `host_permissions`: `https://www.notion.so/*` and `<all_urls>` (for safe audio injection on http/https pages). :contentReference[oaicite:22]{index=22}

---

## Styling

Popup UI styles live in `popup.css` (flex rows for header/fields/actions, disabled states, hover, etc.). Adjust as you like. :contentReference[oaicite:23]{index=23}

---

## Packaging for the Chrome Web Store

1. Remove dev-only files (see `.gitignore` below).  
2. Zip only the **needed assets**: `manifest.json`, popup files, `sw.js`, icons, `execute.mp3`, `_locales/`.  
3. Upload the zip in the Developer Dashboard and fill in listing details (privacy, permissions rationale, screenshots).

---

## Privacy & Disclaimer

- No third-party servers. All requests go directly to **notion.so** using your logged-in session cookie.   
- Uses **private Notion endpoints**; functionality may break if Notion changes those APIs. Review Notion’s ToS before public distribution.

---

## Troubleshooting

- **“Notionにログインしていません。”** → Open `https://www.notion.so/` and sign in, then try again. :contentReference[oaicite:25]{index=25}  
- **CSP inline script errors** → Ensure popup has **no inline JS**; only `popup.js` is referenced. :contentReference[oaicite:26]{index=26}  
- **Sound doesn’t play on some tabs** → Chrome can’t inject into `chrome://` or restricted pages. It will try active tab first, then any `http/https` tab in the window. :contentReference[oaicite:27]{index=27}  
- **Tabs didn’t close** → Only closes tabs that were actually saved (http/https). If saving failed, nothing is closed. :contentReference[oaicite:28]{index=28}

---

## License

GNU General Public License v3.0 (**GPL-3.0-or-later**).

- The source code is licensed under the GNU GPL v3.0 or (at your option) any later version.
- Each source file may include an SPDX header, e.g.:
