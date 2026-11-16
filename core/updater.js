// Auto-updater for MusicVibe + ProArtists (loaded on every page through core/mv.js).
//
// GitHub Pages stamps every file of a site with the time of its last deploy
// (Last-Modified) and tells browsers to cache files for 10 minutes. So every 60s
// (and when you come back to the tab) we ask for that stamp with a tiny HEAD request.
// If a site this page uses was redeployed, we re-download the files this page uses
// straight from the server (like Ctrl+Shift+R) and reload. If you're busy (music
// playing, an upload running, typing) we wait, and offer a "Refresh now" button.

const INTERVAL = 60_000;
const SITES = ["MusicVibe", "ProArtists"];
const KEY = (site) => `mv-deploy:${site}`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// Which of our sites does this page load files from? (ProArtists also uses MusicVibe's core.)
function sitesInUse() {
  const urls = [location.href, ...performance.getEntriesByType("resource").map((e) => e.name)];
  const used = new Set();
  for (const u of urls) {
    try {
      const url = new URL(u);
      if (url.origin !== location.origin) continue;
      const first = url.pathname.split("/")[1];
      if (SITES.includes(first)) used.add(first);
    } catch {}
  }
  return [...used];
}

async function deployStamp(site) {
  const res = await fetch(`/${site}/index.html?update-check=${Date.now()}`, { method: "HEAD", cache: "no-store" });
  if (!res.ok) return null;
  return res.headers.get("last-modified") || res.headers.get("etag");
}

function busy() {
  if ((window.__mvBusy || 0) > 0) return "upload";
  if ([...document.querySelectorAll("audio, video")].some((m) => !m.paused && !m.ended)) return "playing";
  const a = document.activeElement;
  if (a && (a.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable]")) && a.value) return "typing";
  return null;
}

// Re-download everything this page uses from our sites, skipping the browser cache.
async function refreshCache() {
  const urls = new Set([location.href.split("#")[0]]);
  for (const e of performance.getEntriesByType("resource")) {
    try {
      const url = new URL(e.name);
      if (url.origin === location.origin && SITES.includes(url.pathname.split("/")[1]) && !url.searchParams.has("update-check")) urls.add(url.href);
    } catch {}
  }
  await Promise.all([...urls].map((u) => fetch(u, { cache: "reload", credentials: "same-origin" }).catch(() => {})));
}

let pending = null; // { site: stamp } waiting to be applied
let toast = null;

function showToast() {
  if (toast) return;
  toast = document.createElement("div");
  toast.className = "update-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "A new version of MusicVibe is ready.";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Refresh now";
  btn.onclick = () => apply(true);
  toast.append(text, btn);
  document.body.append(toast);
}

async function apply(force = false) {
  if (!pending) return;
  if (!force && busy()) { showToast(); return; }
  for (const [site, stamp] of Object.entries(pending)) store.set(KEY(site), stamp);
  pending = null;
  await refreshCache();
  location.reload();
}

export async function checkForUpdate() {
  if (document.hidden) return;
  try {
    const sites = sitesInUse();
    const fresh = {};
    await Promise.all(sites.map(async (s) => { fresh[s] = await deployStamp(s); }));
    const changed = {};
    for (const s of sites) {
      if (!fresh[s]) continue;
      const known = store.get(KEY(s));
      if (!known) store.set(KEY(s), fresh[s]); // first visit: remember this version
      else if (known !== fresh[s]) changed[s] = fresh[s];
    }
    if (Object.keys(changed).length) {
      pending = { ...(pending || {}), ...changed };
      await apply();
    }
  } catch { /* offline etc.: try again next time */ }
}

// While an update is waiting for you to finish, keep checking if you're free yet.
setInterval(() => { if (pending && !busy()) apply(); }, 5_000);
setInterval(checkForUpdate, INTERVAL);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });
addEventListener("load", () => setTimeout(checkForUpdate, 1500));
window.mvCheckForUpdate = checkForUpdate; // handy for testing in the console
