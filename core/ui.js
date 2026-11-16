// Shared UI pieces for MusicVibe + ProArtists (no framework, builds DOM safely).
import { SITES, mediaUrl, ROLES } from "./mv.js";

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

export const artistUrl = (id) => `${SITES.musicvibe}artist.html?id=${encodeURIComponent(id)}`;
export const songUrl = (id) => `${SITES.musicvibe}song.html?id=${encodeURIComponent(id)}`;

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
