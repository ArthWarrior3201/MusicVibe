// Auto-updater for MusicVibe + ProArtists (loaded on every page through core/mv.js).
//
// GitHub Pages stamps every file of a site with its deploy time (Last-Modified)
// and lets browsers cache files for 10 minutes. Every 60s (and when you come back
// to the tab) we compare, for each site this page uses:
//   - the version THIS PAGE actually loaded  (the copy in the browser's cache), and
//   - the version that's live now             (a tiny HEAD request that skips caches).
// Same → you're up to date (first visit, Ctrl+F5 / Ctrl+Shift+R, or already updated):
// nothing happens. Different → we re-download the page's files fresh and reload.
// If you're busy (music playing, uploading, typing) we wait and show a small
// "A new version of MusicVibe/ProArtists is ready" popup instead.

const INTERVAL = 60_000;
const SITES = ["MusicVibe", "ProArtists"];
const here = location.pathname.split("/")[1];
const appName = here === "ProArtists" ? "ProArtists" : "MusicVibe";
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
};

const siteOf = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin ? x.pathname.split("/")[1] : null; } catch { return null; } };
const isCheck = (u) => u.includes("update-check=");

// Our files this page loaded (page itself + scripts, styles, images from our sites).
function loadedFiles() {
  const urls = [location.href.split("#")[0], ...performance.getEntriesByType("resource").map((e) => e.name)];
  return [...new Set(urls)].filter((u) => SITES.includes(siteOf(u)) && !isCheck(u) && !u.includes("/api/"));
}

// One file per site to compare (scripts first: every page loads them).
function probes() {
  const files = loadedFiles();
  const pick = {};
  for (const s of SITES) {
    const mine = files.filter((u) => siteOf(u) === s);
    pick[s] = mine.find((u) => /\.js(\?|$)/.test(u)) || mine[0];
  }
  return Object.fromEntries(Object.entries(pick).filter(([, u]) => u));
}

const stamp = (res) => res.headers.get("last-modified") || res.headers.get("etag");

async function liveVersion(url) {
  const u = new URL(url);
  u.searchParams.set("update-check", Date.now());
  const res = await fetch(u, { method: "HEAD", cache: "no-store" });
  return res.ok ? stamp(res) : null;
}

// The copy the browser has (= what this page is running). If it's not cached,
// this hits the network and returns the latest, which correctly reads as "up to date".
async function loadedVersion(url) {
  const res = await fetch(url, { cache: "force-cache" });
  return res.ok ? stamp(res) : null;
}

function busy() {
  if ((window.__mvBusy || 0) > 0) return true;
  if ([...document.querySelectorAll("audio, video")].some((m) => !m.paused && !m.ended)) return true;
  const a = document.activeElement;
  return !!(a?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable]") && a.value);
}

async function refreshCache() {
  await Promise.all(loadedFiles().map((u) => fetch(u, { cache: "reload" }).catch(() => {})));
}

let pending = null; // live stamps we still need to apply
let toast = null;

function showToast() {
  if (toast) return;
  toast = document.createElement("div");
  toast.className = "update-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = `A new version of ${appName} is ready.`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Refresh now";
  btn.onclick = () => apply(true);
  toast.append(text, btn);
  document.body.append(toast);
}

function hideToast() { toast?.remove(); toast = null; }

async function apply(force = false) {
  if (!pending) return;
  if (!force && busy()) { showToast(); return; }
  const key = `mv-updated:${Object.values(pending).join("|")}`;
  // Reload once per new version; if the CDN is still serving the old files, don't loop.
  if (!force && session.get(key)) { pending = null; hideToast(); return; }
  session.set(key, "1");
  pending = null;
  await refreshCache();
  location.reload();
}

export async function checkForUpdate() {
  if (document.hidden) return;
  try {
    const behind = {};
    await Promise.all(Object.entries(probes()).map(async ([site, url]) => {
      const [live, loaded] = await Promise.all([liveVersion(url), loadedVersion(url)]);
      if (live && loaded && live !== loaded) behind[site] = live;
    }));
    if (Object.keys(behind).length) {
      pending = behind;
      await apply();
    } else {
      pending = null; // already up to date (e.g. you pressed Ctrl+F5): no popup
      hideToast();
    }
  } catch { /* offline etc.: try again next time */ }
}

setInterval(() => { if (pending && !busy()) apply(); }, 5_000);
setInterval(checkForUpdate, INTERVAL);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });
addEventListener("load", () => setTimeout(checkForUpdate, 1500));
window.mvCheckForUpdate = checkForUpdate; // handy for testing in the console
