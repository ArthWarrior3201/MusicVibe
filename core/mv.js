// MusicVibe shared core: Supabase client + auth + profile helpers.
// Used by MusicVibe and ProArtists (imported from /MusicVibe/core/mv.js).
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITES, API_BASE } from "./supabase-config.js";

export { SITES, API_BASE };
export const isConfigured = !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
export const isApiConfigured = !API_BASE.includes("YOUR_");


// ---------- "Keep me signed in" ----------
// Remembered sessions go in localStorage (survive closing the browser),
// others in sessionStorage (gone when the tab closes).
const REMEMBER_KEY = "mv-remember";
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const remembers = () => safe(() => localStorage.getItem(REMEMBER_KEY), null) !== "0";
export function setRemember(on) { safe(() => localStorage.setItem(REMEMBER_KEY, on ? "1" : "0")); }

const sessionStore = {
  getItem: (k) => safe(() => sessionStorage.getItem(k)) ?? safe(() => localStorage.getItem(k)),
  setItem: (k, v) => {
    const [keep, drop] = remembers() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    safe(() => keep.setItem(k, v));
    safe(() => drop.removeItem(k));
  },
  removeItem: (k) => { safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); },
};

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : "https://not-configured.supabase.co",
  isConfigured ? SUPABASE_ANON_KEY : "not-configured",
  { auth: { storage: sessionStore, storageKey: "mv-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
export const auth = supabase.auth;

// ---------- urls ----------
const abs = (path) => new URL(path, location.origin).href;

// Only allow redirects back to our own site (blocks ?next=https://evil.site).
export function safeNext(raw, fallback = SITES.musicvibe + "app.html") {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

// "artist" when the flow started from ProArtists, so emails use the ProArtists templates.
export function appFor(next) {
  return String(next || "").startsWith(SITES.proartists) ? "artist" : "listener";
}

function authPageUrl(mode, next) {
  const u = new URL(abs(SITES.musicvibe + "auth.html"));
  u.searchParams.set("mode", mode);
  if (next) u.searchParams.set("next", next);
  return u.href;
}

export function authUrl(mode = "signin", next = location.pathname + location.search) {
  return `${SITES.musicvibe}auth.html?mode=${mode}&next=${encodeURIComponent(next)}`;
}

// ---------- usernames ----------
export const USERNAME_RE = /^[a-z][a-z0-9_.]{2,19}$/;
const RESERVED = new Set(["admin", "administrator", "root", "support", "help", "musicvibe", "proartists", "moderator", "staff", "official"]);

export function normalizeUsername(raw) {
  return (raw || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "_");
}

export function usernameProblem(name) {
  if (name.length < 3) return "At least 3 characters.";
  if (name.length > 20) return "20 characters max.";
  if (!/^[a-z]/.test(name)) return "Must start with a letter.";
  if (!USERNAME_RE.test(name)) return "Only letters, numbers, _ and .";
  if (RESERVED.has(name)) return "That username is reserved.";
  return null;
}

export async function isUsernameTaken(name) {
  const { data, error } = await supabase.rpc("username_available", { name });
  if (error) throw error;
  return data === false;
}

// ---------- profile ----------
// Columns: id, username, display_name, avatar_url, bio, is_artist, created_at, updated_at
export async function getProfile(uid) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  return data;
}

// For accounts that somehow have no profile yet (fallback; sign-up normally creates it).
export async function createProfile(user, { username, displayName }) {
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username,
    display_name: displayName || username,
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
  });
  if (error) throw error.code === "23505" ? coded("username-taken") : error;
}

// ---------- auth modes ----------
// Email sign-up. The database creates the profile from { username, display_name }.
// Returns { needsConfirmation } — true when Supabase wants the email confirmed first.
export async function signUpWithEmail({ email, password, username, displayName, remember = true, next }) {
  setRemember(remember);
  if (await isUsernameTaken(username)) throw coded("username-taken");
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName, signup_app: appFor(next) },
      emailRedirectTo: authPageUrl("signin", next),
    },
  });
  if (error) {
    if (/database error saving new user/i.test(error.message)) throw coded("username-taken");
    throw error;
  }
  // Supabase hides "email already registered" by returning a user with no identities.
  if (data.user && data.user.identities?.length === 0) throw coded("email_exists");
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signInWithEmail({ email, password, remember = true }) {
  setRemember(remember);
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function resetPassword(email, next) {
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo: authPageUrl("newpassword", next) });
  if (error) throw error;
}

// Email verification codes (sent by our Apps Script mailer).
// Sign-up: confirms the email and signs the user in.
export async function verifySignupCode(email, code) {
  const { data, error } = await auth.verifyOtp({ email, token: code, type: "signup" });
  if (error) throw error;
  return data.user;
}

// Password reset: signs the user in so they can set a new password.
export async function verifyResetCode(email, code) {
  const { data, error } = await auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) throw error;
  return data.user;
}

export async function updatePassword(password) {
  const { error } = await auth.updateUser({ password });
  if (error) throw error;
}

export async function resendConfirmation(email, next) {
  const { error } = await auth.resend({ type: "signup", email, options: { emailRedirectTo: authPageUrl("signin", next) } });
  if (error) throw error;
}

export async function signOut() {
  await auth.signOut();
}

export async function currentUser() {
  if (!isConfigured) return null;
  const { data } = await auth.getSession();
  return data.session?.user ?? null;
}

// cb(event, user)
export function onAuthChange(cb) {
  const { data } = auth.onAuthStateChange((event, session) => cb(event, session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// ---------- MV-Storage API (Vercel) ----------
async function api(path, { method = "GET", json, body, headers = {}, keepalive } = {}) {
  const { data } = await auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(API_BASE + path, {
    method,
    keepalive,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });
  const out = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(out?.error || `Server error (${res.status})`), { status: res.status });
  return out;
}

// "New sign-in" email. Fire and forget: never blocks or breaks sign-in.
export function notifySignIn({ app = "listener", method = "password" } = {}) {
  if (!isApiConfigured) return;
  api("/api/notify-signin", { method: "POST", json: { app, method }, keepalive: true }).catch(() => {});
}

// Upload a file (audio, or a jpg/png/webp picture) in 4 MB parts. onProgress(0..1). Returns { id, url }.
export async function uploadFile(file, { onProgress = () => {} } = {}) {
  const { id, chunkSize, partCount } = await api("/api/upload/start", {
    method: "POST", json: { filename: file.name, size: file.size },
  });
  let done = 0;
  const sendPart = async (n) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await api(`/api/upload/chunk?id=${id}&n=${n}`, {
          method: "PUT",
          body: file.slice(n * chunkSize, (n + 1) * chunkSize),
          headers: { "Content-Type": "application/octet-stream" },
        });
        onProgress(++done / partCount);
        return;
      } catch (e) {
        if (attempt >= 3 || (e.status && e.status < 500 && e.status !== 429)) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  };
  // 3 parts at a time
  let nextPart = 0;
  await Promise.all(Array.from({ length: Math.min(3, partCount) }, async () => {
    while (nextPart < partCount) await sendPart(nextPart++);
  }));
  await api(`/api/upload/finish?id=${id}`, { method: "POST" });
  return { id, url: mediaUrl(id) };
}

export const uploadAudio = uploadFile;
export const mediaUrl = (id) => (id ? `${API_BASE}/api/media/${id}` : null);

export function deleteMedia(id) {
  return api(`/api/media/${id}`, { method: "DELETE" });
}

export async function listMyMedia() {
  const { data, error } = await supabase
    .from("media_files")
    .select("id, filename, mime, size, status, created_at")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- artists ----------
// artists: { id (= user id), name, bio, avatar_media_id }
const must = ({ data, error }) => { if (error) throw error; return data; };

export async function getArtist(id) {
  return must(await supabase.from("artists").select("*").eq("id", id).maybeSingle());
}

export async function saveMyArtist({ name, bio = "", avatarMediaId = null }) {
  const user = await currentUser();
  const existing = await getArtist(user.id);
  const row = { name: name.trim(), bio: bio.trim(), avatar_media_id: avatarMediaId };
  if (existing) return must(await supabase.from("artists").update(row).eq("id", user.id).select().single());
  return must(await supabase.from("artists").insert({ id: user.id, ...row }).select().single());
}

export async function searchArtists(query, limit = 8) {
  const q = query.trim().replace(/[%_,()]/g, "");
  if (!q) return [];
  return must(await supabase.from("artists").select("id, name, avatar_media_id").ilike("name", `%${q}%`).limit(limit));
}

// ---------- songs ----------
export const ROLES = {
  main: "Main artist", featured: "Featured artist", performer: "Performer", producer: "Producer",
  composer: "Composer", lyricist: "Lyricist", mixing: "Mixing engineer", mastering: "Mastering engineer",
};

// credits: [{ artistId?, name, roles: [...], canEdit?, canDelete? }]. The uploader is always
// the main artist; pass their own credit first (or it's added for you).
export async function createSong({ title, audioMediaId, coverMediaId = null, credits = [] }) {
  const user = await currentUser();
  const me = await getArtist(user.id);
  if (!me) throw Object.assign(new Error("Create your artist profile first."), { code: "no-artist" });
  const id = crypto.randomUUID();
  must(await supabase.from("songs").insert({ id, artist_id: me.id, title: title.trim(), audio_media_id: audioMediaId, cover_media_id: coverMediaId }));
  let list = credits.filter((c) => c.name?.trim() && c.roles?.length);
  if (!list.some((c) => c.artistId === me.id)) list = [{ artistId: me.id, name: me.name, roles: ["main"] }, ...list];
  const seen = new Set();
  list = list.filter((c) => !c.artistId || (!seen.has(c.artistId) && seen.add(c.artistId)));
  must(await supabase.from("song_credits").insert(list.map((c, i) => ({
    song_id: id, position: i, artist_id: c.artistId || null, name: c.name.trim(), roles: c.roles,
    can_edit: c.artistId === me.id ? false : !!c.canEdit, can_delete: c.artistId === me.id ? false : !!c.canDelete,
  }))));
  return id;
}

// { song, artist (main), credits: [...] , artists: { id: artist } }
export async function getSong(id) {
  const song = must(await supabase.from("songs").select("*").eq("id", id).maybeSingle());
  if (!song) return null;
  const credits = must(await supabase.from("song_credits").select("*").eq("song_id", id).order("position"));
  const ids = [...new Set([song.artist_id, ...credits.map((c) => c.artist_id).filter(Boolean)])];
  const list = must(await supabase.from("artists").select("*").in("id", ids));
  const artists = Object.fromEntries(list.map((a) => [a.id, a]));
  return { song, artist: artists[song.artist_id], credits, artists };
}

export async function listArtistSongs(artistId) {
  return must(await supabase.from("songs").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }));
}

// Songs other artists put this artist on.
export async function listFeaturedOn(artistId) {
  const credits = must(await supabase.from("song_credits").select("song_id, roles, can_edit, can_delete").eq("artist_id", artistId));
  const ids = credits.map((c) => c.song_id);
  if (!ids.length) return [];
  const songs = must(await supabase.from("songs").select("*").in("id", ids).neq("artist_id", artistId).order("created_at", { ascending: false }));
  const byId = Object.fromEntries(credits.map((c) => [c.song_id, c]));
  return songs.map((s) => ({ ...s, credit: byId[s.id] }));
}

// Owner: deletes the audio file too (which removes the song). Collaborator: removes the song only.
export async function deleteSong(song) {
  const user = await currentUser();
  if (song.artist_id === user.id) {
    await deleteMedia(song.audio_media_id);
    if (song.cover_media_id) deleteMedia(song.cover_media_id).catch(() => {});
    return;
  }
  const gone = must(await supabase.from("songs").delete().eq("id", song.id).select("id"));
  if (!gone.length) throw new Error("You don't have permission to delete this song.");
}

// Square-crop + resize a picture in the browser before uploading (keeps uploads small).
export async function squareImage(file, size = 640) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111833"; // JPEG has no transparency: fill see-through PNG areas with the site's navy
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg", { type: "image/jpeg" });
}

// ---------- page guard ----------
// Use on any page that needs a signed-in user with a finished profile.
// Returns { user, profile } or navigates away.
export async function requireUser() {
  const user = await currentUser();
  if (!user) { location.replace(authUrl("signin")); return new Promise(() => {}); }
  const profile = await getProfile(user.id);
  if (!profile) { location.replace(authUrl("username")); return new Promise(() => {}); }
  return { user, profile };
}

// ---------- errors ----------
function coded(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const MESSAGES = {
  "username-taken": "That username is taken. Try another one.",
  email_exists: "An account with this email already exists. Sign in instead.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_address_invalid: "That email address doesn't look right.",
  weak_password: "That password is too weak. Use at least 8 characters with letters and numbers.",
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Please confirm your email first. Check your inbox for the link.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  same_password: "Your new password must be different from the old one.",
  provider_disabled: "This sign-in method isn't turned on in Supabase yet.",
  email_provider_disabled: "Email sign-up isn't turned on in Supabase yet.",
  signup_disabled: "New sign-ups are turned off right now.",
  session_not_found: "Your session expired. Please sign in again.",
  otp_expired: "That code is wrong or has expired. Check it, or get a new one.",
};

export function friendlyError(e) {
  if (!e) return "Something went wrong.";
  if (MESSAGES[e.code]) return MESSAGES[e.code];
  if (e.name === "AuthRetryableFetchError" || /failed to fetch|networkerror/i.test(e.message)) {
    return "Can't reach the server. Check your connection.";
  }
  return e.message || "Something went wrong.";
}
