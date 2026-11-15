// MusicVibe shared core: Supabase client + auth + profile helpers.
// Used by MusicVibe and ProArtists (imported from /MusicVibe/core/mv.js).
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITES } from "./supabase-config.js";

export { SITES };
export const isConfigured = !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");

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

// For accounts that don't have a profile yet (first Google sign-in).
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
export async function signUpWithEmail({ email, password, username, displayName, remember = true }) {
  setRemember(remember);
  if (await isUsernameTaken(username)) throw coded("username-taken");
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName },
      emailRedirectTo: abs(SITES.musicvibe + "auth.html?mode=signin"),
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

// Google always leaves the page and comes back to auth.html, which finishes the sign-in.
export async function signInWithGoogle({ remember = true, next } = {}) {
  setRemember(remember);
  const back = new URL(abs(SITES.musicvibe + "auth.html"));
  back.searchParams.set("mode", "signin");
  if (next) back.searchParams.set("next", next);
  const { error } = await auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: back.href, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: abs(SITES.musicvibe + "auth.html?mode=newpassword"),
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await auth.updateUser({ password });
  if (error) throw error;
}

export async function resendConfirmation(email) {
  const { error } = await auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: abs(SITES.musicvibe + "auth.html?mode=signin") },
  });
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
  otp_expired: "That link has expired. Request a new one.",
};

export function friendlyError(e) {
  if (!e) return "Something went wrong.";
  if (MESSAGES[e.code]) return MESSAGES[e.code];
  if (e.name === "AuthRetryableFetchError" || /failed to fetch|networkerror/i.test(e.message)) {
    return "Can't reach the server. Check your connection.";
  }
  return e.message || "Something went wrong.";
}
