// Shared UI pieces for MusicVibe + ProArtists (no framework, builds DOM safely).
import { SITES, mediaUrl, ROLES, isFollowing, follow, unfollow, friendlyError, songSource, lyricLines, isSynced } from "./mv.js";

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

export const artistUrl = (id) => `${SITES.musicvibe}artist.html?id=${encodeURIComponent(id)}`;
export const songUrl = (id) => `${SITES.musicvibe}song.html?id=${encodeURIComponent(id)}`;
export const playlistUrl = (id) => `${SITES.musicvibe}playlist.html?id=${encodeURIComponent(id)}`;
const LOGO = `${SITES.musicvibe}img/logo-192.png`;
export const coverOf = (song) => mediaUrl(song.cover_media_id) || mediaUrl(song.artist?.avatar_media_id) || LOGO;

// Picture or a gradient with the first letter. shape: "circle" | "square"
export function avatar(artist, { size = 48, shape = "circle", cls = "" } = {}) {
  const box = el("span", { className: `avatar-box ${shape} ${cls}` });
  box.style.setProperty("--size", `${size}px`);
  const src = mediaUrl(artist?.avatar_media_id);
  if (src) box.append(el("img", { src, alt: "", loading: "lazy", decoding: "async" }));
  else box.append(el("span", { className: "initial", textContent: (artist?.name || "?").trim()[0]?.toUpperCase() || "?" }));
  return box;
}

// The "About the artist" tile: a wide crop of the artist's photo (cropped to fit with
// object-fit: cover, never stretched), the name under it, and the start of their
// description. With no description the name is shown bigger instead.
// The whole card opens the artist page; the Follow button on it just follows.
export function artistTile(artist, { label = "About the artist", showFollow = true } = {}) {
  const bio = (artist.bio || "").trim();
  const tile = el("div", { className: "artist-tile" + (bio ? "" : " no-bio") });
  const media = el("div", { className: "artist-tile-media" });
  const src = mediaUrl(artist.avatar_media_id);
  if (src) media.append(el("img", { src, alt: "", loading: "lazy", decoding: "async" }));
  else media.append(el("span", { className: "initial", textContent: artist.name.trim()[0]?.toUpperCase() || "?" }));
  media.append(el("span", { className: "artist-tile-label", textContent: label }));
  // stretched link: covers the whole card, sits under the Follow button
  const link = el("a", { className: "artist-tile-link", href: artistUrl(artist.id) },
    el("h3", { className: "artist-tile-name", textContent: artist.name }));
  link.setAttribute("aria-label", `${artist.name}: open artist page`);
  const body = el("div", { className: "artist-tile-body" },
    link,
    bio ? el("p", { className: "artist-tile-bio", textContent: bio }) : null,
    el("div", { className: "artist-tile-foot" },
      el("span", { className: "artist-tile-cta", textContent: "View artist →" }),
      showFollow ? followButton(artist.id) : null),
  );
  tile.append(media, body);
  return tile;
}

// ---------- Share ----------
// Our own small popup inside the page (no browser/Windows share window, so popup
// and ad blockers can't interfere): the link, a Copy button, and an X to close.
let shareBox;
function openShare({ title, url }) {
  shareBox?.close();
  const input = el("input", { className: "share-link", type: "text", value: url, readOnly: true });
  input.setAttribute("aria-label", "Link");
  const copy = el("button", { className: "share-copy", type: "button", textContent: "Copy" });
  const x = el("button", { className: "share-x", type: "button", title: "Close", textContent: "✕" });
  x.setAttribute("aria-label", "Close");
  const card = el("div", { className: "share-card", role: "dialog" },
    x,
    el("h3", { textContent: "Share" }),
    el("p", { className: "muted share-what", textContent: title }),
    el("div", { className: "share-row" }, input, copy));
  card.setAttribute("aria-modal", "true");
  const back = el("div", { className: "share-backdrop" }, card);
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); shareBox = null; };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  x.onclick = close;
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey);
  input.onfocus = () => input.select();
  copy.onclick = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; }
    catch { input.select(); try { ok = document.execCommand("copy"); } catch {} }
    if (ok) { copy.textContent = "Copied"; copy.classList.add("done"); }
    else { copy.textContent = "Press Ctrl+C"; input.select(); }
  };
  document.body.append(back);
  input.focus();
  shareBox = { close };
}

export function shareButton({ title, url = location.href.split("#")[0] }) {
  const btn = el("button", { className: "btn ghost small share-btn", type: "button", textContent: "Share" });
  btn.onclick = () => openShare({ title, url });
  return btn;
}

// Credits: one heading per role, exactly as chosen on ProArtists, in this order.
// A heading only appears when at least one person on the song has that role.
// Someone with several roles is listed under each of them.
const CREDIT_HEADINGS = [
  ["main", "Main Artist", "Main Artists"],
  ["featured", "Featured Artist", "Featured Artists"],
  ["performer", "Performer", "Performers"],
  ["producer", "Producer", "Producers"],
  ["composer", "Composer", "Composers"],
  ["lyricist", "Lyricist", "Lyricists"],
  ["mixing", "Mixing Engineer", "Mixing Engineers"],
  ["mastering", "Mastering Engineer", "Mastering Engineers"],
];

export function creditsList(credits) {
  const wrap = el("div", { className: "credits" });
  for (const [role, one, many] of CREDIT_HEADINGS) {
    const people = credits.filter((c) => c.roles.includes(role));
    if (!people.length) continue;
    wrap.append(
      el("h4", { textContent: people.length === 1 ? one : many }),
      el("ul", {}, people.map((c) => el("li", {},
        c.artist_id ? el("a", { href: artistUrl(c.artist_id), textContent: c.name }) : el("span", { textContent: c.name })))),
    );
  }
  return wrap;
}

// "Main, Featured" artist line with links.
export function artistLine(credits, artists, mainId) {
  const people = credits.filter((c) => c.roles.includes("main") || c.roles.includes("featured"));
  if (!people.some((c) => c.artist_id === mainId) && artists[mainId]) people.unshift({ artist_id: mainId, name: artists[mainId].name, roles: ["main"] });
  const span = el("span", { className: "artist-line" });
  people.forEach((c, i) => {
    if (i) span.append(", ");
    span.append(c.artist_id ? el("a", { href: artistUrl(c.artist_id), textContent: c.name }) : c.name);
  });
  return span;
}

// ---------- Follow button ----------
// onChange(following) lets a page update a follower count.
export function followButton(artistId, { onChange } = {}) {
  const btn = el("button", { className: "btn ghost small follow-btn", textContent: "Follow", type: "button" });
  let following = false;
  const paint = () => {
    btn.textContent = following ? "Following" : "Follow";
    btn.classList.toggle("on", following);
    btn.setAttribute("aria-pressed", String(following));
  };
  isFollowing(artistId).then((f) => { following = f; paint(); }).catch(() => {});
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      following ? await unfollow(artistId) : await follow(artistId);
      following = !following;
      paint();
      onChange?.(following);
    } catch (e) { alert(friendlyError(e)); }
    btn.disabled = false;
  };
  return btn;
}

// ---------- player controls (used by the song page and the mini player) ----------
// Our own controls instead of the browser's: no grey "downloaded so far" bar, just
// your position. Songs are fully downloaded first (songSource), so nothing can
// interrupt them mid-song.
const fmt = (t) => {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const PLAY_VOLUME = 0.8;

export function createPlayer({ audioId } = {}) {
  const audio = el("audio", { preload: "auto", crossOrigin: "anonymous" });
  if (audioId) audio.id = audioId;
  const play = el("button", { className: "vp-play", type: "button", title: "Play", textContent: "▶" });
  const cur = el("span", { className: "vp-time", textContent: "0:00" });
  const seek = el("input", { className: "vp-seek", type: "range", min: 0, max: 0, step: 0.1, value: 0, disabled: true });
  seek.setAttribute("aria-label", "Seek");
  const dur = el("span", { className: "vp-time", textContent: "0:00" });
  const status = el("span", { className: "vp-status" });
  const root = el("div", { className: "vplayer" }, audio, play, cur, seek, dur, status);
  // No volume bar: a fixed, comfortable level with some headroom (use your device's volume).
  audio.volume = PLAY_VOLUME;
  try { localStorage.removeItem("mv-volume"); } catch {}

  let dragging = false;
  const paint = () => {
    const d = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!dragging) seek.value = audio.currentTime;
    seek.max = d;
    seek.style.setProperty("--p", d ? `${(Number(seek.value) / d) * 100}%` : "0%");
    cur.textContent = fmt(dragging ? Number(seek.value) : audio.currentTime);
    dur.textContent = fmt(d);
  };
  audio.addEventListener("timeupdate", paint);
  audio.addEventListener("loadedmetadata", () => { seek.disabled = false; paint(); });
  audio.addEventListener("play", () => { play.textContent = "❚❚"; play.title = "Pause"; });
  audio.addEventListener("pause", () => { play.textContent = "▶"; play.title = "Play"; });
  seek.addEventListener("input", () => { dragging = true; paint(); });
  seek.addEventListener("change", () => { audio.currentTime = Number(seek.value); dragging = false; paint(); });

  let loadSeq = 0;
  let wantPlay = false;
  const api = {
    root, audio,
    // song needs .audio_media_id. autoplay: start as soon as it's downloaded.
    async load(song, { autoplay = false } = {}) {
      const mine = ++loadSeq;
      wantPlay = autoplay;
      audio.pause();
      audio.removeAttribute("src");
      seek.disabled = true; seek.value = 0; paint();
      status.textContent = "Loading…";
      root.classList.add("loading");
      try {
        const src = await songSource(song.audio_media_id, (p) => { if (mine === loadSeq) status.textContent = `Loading… ${Math.round(p * 100)}%`; });
        if (mine !== loadSeq) return;
        audio.src = src.url;
        status.textContent = "";
        root.classList.remove("loading");
        if (wantPlay) await audio.play().catch(() => {});
      } catch (e) {
        if (mine !== loadSeq) return;
        root.classList.remove("loading");
        status.textContent = "Couldn't load this song. Check your connection and try again.";
        status.classList.add("bad");
        api.onerror?.(e);
      }
    },
    play() { if (audio.src) audio.play().catch(() => {}); else wantPlay = true; },
    pause() { wantPlay = false; audio.pause(); },
  };
  play.onclick = () => (audio.paused ? api.play() : api.pause());
  return api;
}

// ---------- lyrics (Spotify-style) ----------
// Not synced: every line stays bright white, with a note on top.
// Synced: the line being sung lights up and the rest fade back, following `audio`;
// click a line to jump there. The box scrolls to keep the current line in view
// (unless you're scrolling it yourself).
export function lyricsView(song, audio) {
  const lines = lyricLines(song.lyrics);
  const synced = isSynced(song);
  const times = synced ? song.lyrics_sync : [];
  const box = el("div", { className: "lyrics" + (synced ? " synced" : " unsynced") });
  if (!synced) box.append(el("p", { className: "lyrics-note", textContent: "These lyrics haven't been time-synced yet." }));
  const nodes = lines.map((line, i) => {
    if (!line.trim()) return box.appendChild(el("div", { className: "lyric-gap" }));
    const n = el(synced ? "button" : "p", { className: "lyric-line", textContent: line });
    if (synced) {
      n.type = "button";
      n.onclick = () => { audio.currentTime = times[i] + 0.01; audio.play?.().catch(() => {}); };
    }
    return box.appendChild(n);
  });
  if (!synced || !audio) return box;

  let active = -1, userScrollUntil = 0;
  box.addEventListener("wheel", () => { userScrollUntil = Date.now() + 3000; }, { passive: true });
  box.addEventListener("touchmove", () => { userScrollUntil = Date.now() + 3000; }, { passive: true });
  const update = () => {
    const t = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) if (typeof times[i] === "number" && times[i] <= t + 0.05) idx = i;
    if (idx === active) return;
    nodes[active]?.classList.remove("active");
    active = idx;
    const n = nodes[active];
    if (!n) return;
    n.classList.add("active");
    if (Date.now() > userScrollUntil) box.scrollTo({ top: n.offsetTop - box.clientHeight / 2 + n.offsetHeight / 2, behavior: "smooth" });
  };
  let raf = 0;
  const loop = () => { update(); raf = audio.paused ? 0 : requestAnimationFrame(loop); };
  audio.addEventListener("play", () => { if (!raf) raf = requestAnimationFrame(loop); });
  audio.addEventListener("seeked", update);
  audio.addEventListener("timeupdate", update);
  update();
  return box;
}

// ---------- mini player (bottom bar, plays a queue) ----------
let player;
function ensurePlayer() {
  if (player) return player;
  const controls = createPlayer();
  const audio = controls.audio;
  const cover = el("img", { className: "mp-cover", alt: "" });
  const title = el("a", { className: "mp-title" });
  const artist = el("a", { className: "mp-artist" });
  const prev = el("button", { className: "mp-btn", type: "button", title: "Previous", textContent: "⏮" });
  const next = el("button", { className: "mp-btn", type: "button", title: "Next", textContent: "⏭" });
  const close = el("button", { className: "mp-btn", type: "button", title: "Close", textContent: "✕" });
  const bar = el("div", { className: "mini-player", hidden: true },
    cover, el("div", { className: "mp-meta" }, title, artist), prev, controls.root, next, close);
  document.body.append(bar);
  document.body.classList.add("has-player-space");
  player = { bar, audio, controls, cover, title, artist, prev, next, queue: [], index: 0 };
  const load = (i) => {
    const song = player.queue[i];
    if (!song) return;
    player.index = i;
    controls.load(song, { autoplay: true });
    // get the next song ready too, so it starts instantly
    const upcoming = player.queue[i + 1];
    if (upcoming) songSource(upcoming.audio_media_id).catch(() => {});
    cover.src = coverOf(song);
    title.textContent = song.title;
    title.href = songUrl(song.id);
    artist.textContent = song.artist?.name || "";
    if (song.artist) artist.href = artistUrl(song.artist.id); else artist.removeAttribute("href");
    prev.disabled = i === 0;
    next.disabled = i >= player.queue.length - 1;
    document.querySelectorAll("[data-playing]").forEach((n) => n.removeAttribute("data-playing"));
    document.querySelectorAll(`[data-song-id="${song.id}"]`).forEach((n) => n.setAttribute("data-playing", ""));
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist?.name || "", artwork: [{ src: coverOf(song) }] });
    }
  };
  player.load = load;
  prev.onclick = () => load(player.index - 1);
  next.onclick = () => load(player.index + 1);
  audio.addEventListener("ended", () => { if (player.index < player.queue.length - 1) load(player.index + 1); });
  close.onclick = () => { controls.pause(); bar.hidden = true; };
  if ("mediaSession" in navigator) { // keyboard / headphone / lock-screen buttons
    navigator.mediaSession.setActionHandler("previoustrack", () => { if (player.index > 0) load(player.index - 1); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { if (player.index < player.queue.length - 1) load(player.index + 1); });
  }
  return player;
}

export function playQueue(songs, start = 0) {
  const p = ensurePlayer();
  p.queue = songs;
  p.bar.hidden = false;
  p.load(start);
}

// ---------- song row: cover · title/artist · actions ----------
// opts.queue + opts.index make the play button play through the list.
export function songRow(song, { queue = [song], index = 0, actions = [] } = {}) {
  const play = el("button", { className: "row-play", type: "button", title: `Play ${song.title}`, textContent: "▶" });
  play.onclick = () => playQueue(queue, index);
  return el("li", { className: "song-row" },
    el("span", { className: "cover-sm" }, el("img", { src: coverOf(song), alt: "", loading: "lazy" }), play),
    el("span", { className: "song-row-text" },
      el("a", { className: "song-row-title", href: songUrl(song.id), textContent: song.title }),
      song.artist ? el("a", { className: "song-row-artist", href: artistUrl(song.artist.id), textContent: song.artist.name }) : null),
    ...actions,
  );
}

export function songList(songs, { actions } = {}) {
  return songs.map((s, i) => {
    const row = songRow(s, { queue: songs, index: i, actions: actions ? actions(s, i) : [] });
    row.dataset.songId = s.id;
    return row;
  });
}
