// Shared UI pieces for MusicVibe + ProArtists (no framework, builds DOM safely).
import { SITES, mediaUrl, ROLES, isFollowing, follow, unfollow, friendlyError } from "./mv.js";

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
export function artistTile(artist, { label = "About the artist" } = {}) {
  const bio = (artist.bio || "").trim();
  const tile = el("a", { className: "artist-tile" + (bio ? "" : " no-bio"), href: artistUrl(artist.id) });
  tile.setAttribute("aria-label", `${artist.name}: open artist page`);
  const media = el("div", { className: "artist-tile-media" });
  const src = mediaUrl(artist.avatar_media_id);
  if (src) media.append(el("img", { src, alt: "", loading: "lazy", decoding: "async" }));
  else media.append(el("span", { className: "initial", textContent: artist.name.trim()[0]?.toUpperCase() || "?" }));
  media.append(el("span", { className: "artist-tile-label", textContent: label }));
  const body = el("div", { className: "artist-tile-body" },
    el("h3", { className: "artist-tile-name", textContent: artist.name }),
    bio ? el("p", { className: "artist-tile-bio", textContent: bio }) : null,
    el("span", { className: "artist-tile-cta", textContent: "View artist →" }),
  );
  tile.append(media, body);
  return tile;
}

// Credits grouped the way music apps show them.
const GROUPS = [
  ["Performed by", ["main", "featured", "performer"]],
  ["Written by", ["composer", "lyricist"]],
  ["Produced by", ["producer"]],
  ["Mixing & mastering", ["mixing", "mastering"]],
];

export function creditsList(credits) {
  const wrap = el("div", { className: "credits" });
  for (const [title, roles] of GROUPS) {
    const people = credits.filter((c) => c.roles.some((r) => roles.includes(r)));
    if (!people.length) continue;
    wrap.append(el("h4", { textContent: title }), el("ul", {}, people.map((c) => el("li", {},
      c.artist_id ? el("a", { href: artistUrl(c.artist_id), textContent: c.name }) : el("span", { textContent: c.name }),
      el("span", { className: "muted", textContent: c.roles.filter((r) => roles.includes(r)).map((r) => ROLES[r]).join(", ") }),
    ))));
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

// ---------- mini player (bottom bar, plays a queue) ----------
let player;
function ensurePlayer() {
  if (player) return player;
  const audio = el("audio", { controls: true, preload: "auto" });
  const cover = el("img", { className: "mp-cover", alt: "" });
  const title = el("a", { className: "mp-title" });
  const artist = el("a", { className: "mp-artist" });
  const prev = el("button", { className: "mp-btn", type: "button", title: "Previous", textContent: "⏮" });
  const next = el("button", { className: "mp-btn", type: "button", title: "Next", textContent: "⏭" });
  const close = el("button", { className: "mp-btn", type: "button", title: "Close", textContent: "✕" });
  const bar = el("div", { className: "mini-player", hidden: true },
    cover, el("div", { className: "mp-meta" }, title, artist), prev, audio, next, close);
  document.body.append(bar);
  document.body.classList.add("has-player-space");
  player = { bar, audio, cover, title, artist, prev, next, queue: [], index: 0 };
  const load = (i) => {
    const song = player.queue[i];
    if (!song) return;
    player.index = i;
    audio.src = mediaUrl(song.audio_media_id);
    cover.src = coverOf(song);
    title.textContent = song.title;
    title.href = songUrl(song.id);
    artist.textContent = song.artist?.name || "";
    if (song.artist) artist.href = artistUrl(song.artist.id); else artist.removeAttribute("href");
    prev.disabled = i === 0;
    next.disabled = i >= player.queue.length - 1;
    audio.play().catch(() => {});
    document.querySelectorAll("[data-playing]").forEach((n) => n.removeAttribute("data-playing"));
    document.querySelectorAll(`[data-song-id="${song.id}"]`).forEach((n) => n.setAttribute("data-playing", ""));
  };
  player.load = load;
  prev.onclick = () => load(player.index - 1);
  next.onclick = () => load(player.index + 1);
  audio.onended = () => { if (player.index < player.queue.length - 1) load(player.index + 1); };
  close.onclick = () => { audio.pause(); bar.hidden = true; };
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
