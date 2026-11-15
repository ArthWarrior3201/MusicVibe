// MusicVibe shared core: Firebase init + auth + profile helpers.
// Used by MusicVibe and ProArtists (imported from /MusicVibe/core/mv.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail,
  sendEmailVerification, updateProfile, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, setPersistence,
  browserLocalPersistence, browserSessionPersistence, deleteUser,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig, SITES } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { SITES };

export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

// ---------- usernames ----------
export const USERNAME_RE = /^[a-z][a-z0-9_.]{2,19}$/;

export function normalizeUsername(raw) {
  return (raw || "").trim().toLowerCase().replace(/^@/, "");
}

export function usernameProblem(name) {
  if (name.length < 3) return "At least 3 characters.";
  if (name.length > 20) return "20 characters max.";
  if (!/^[a-z]/.test(name)) return "Must start with a letter.";
  if (!USERNAME_RE.test(name)) return "Only letters, numbers, _ and .";
  return null;
}

export async function isUsernameTaken(name) {
  const snap = await getDoc(doc(db, "usernames", name));
  return snap.exists();
}

// ---------- profile ----------
export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// Claims the username and creates users/{uid} in one atomic batch.
// The Firestore rules reject it if the username is already taken.
export async function createProfile(user, { username, displayName }) {
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid: user.uid });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    username,
    displayName: displayName || username,
    photoURL: user.photoURL || null,
    bio: "",
    isArtist: false,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (e) {
    if (e.code === "permission-denied") throw codedError("username-taken");
    throw e;
  }
  if (displayName && user.displayName !== displayName) {
    await updateProfile(user, { displayName });
  }
}

// ---------- auth modes ----------
export async function signUpWithEmail({ email, password, username, displayName, remember = true }) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  if (await isUsernameTaken(username)) throw codedError("username-taken");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await createProfile(cred.user, { username, displayName });
  } catch (e) {
    // Someone grabbed the username in the last second: roll back the auth account
    // so the user can try again with the same email.
    await deleteUser(cred.user).catch(() => {});
    throw e;
  }
  sendEmailVerification(cred.user, continueSettings()).catch(() => {});
  return cred.user;
}

export async function signInWithEmail({ email, password, remember = true }) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle({ remember = true } = {}) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, googleProvider);
      return null; // page navigates away
    }
    throw e;
  }
}

export function finishRedirectSignIn() {
  return getRedirectResult(auth).catch(() => null);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email, continueSettings());
}

export function resendVerification() {
  if (!auth.currentUser) return Promise.resolve();
  return sendEmailVerification(auth.currentUser, continueSettings());
}

export function signOut() {
  return fbSignOut(auth);
}

// Resolves once Firebase knows whether someone is signed in.
export function currentUser() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
  });
}

export { onAuthStateChanged };

// ---------- page guards ----------
// Only allow redirects back to our own origin (blocks ?next=https://evil.site).
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

// Use on any page that needs a signed-in user with a finished profile.
// Returns { user, profile } or navigates away.
export async function requireUser() {
  const user = await currentUser();
  if (!user) { location.replace(authUrl("signin")); return new Promise(() => {}); }
  const profile = await getProfile(user.uid);
  if (!profile) { location.replace(authUrl("username")); return new Promise(() => {}); }
  return { user, profile };
}

// ---------- errors ----------
function codedError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function continueSettings() {
  return { url: location.origin + SITES.musicvibe + "auth.html?mode=signin" };
}

const MESSAGES = {
  "username-taken": "That username is taken. Try another one.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/weak-password": "Password needs at least 8 characters.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/cancelled-popup-request": "Google sign-in was closed before it finished.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/unauthorized-domain": "This site isn't allowed in Firebase yet. Add it under Authentication -> Settings -> Authorized domains.",
  "auth/account-exists-with-different-credential": "This email already uses a different sign-in method. Sign in with email and password.",
  "auth/operation-not-allowed": "This sign-in method isn't turned on in Firebase yet.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Firebase isn't set up yet. Fill in core/firebase-config.js.",
};

export function friendlyError(e) {
  return MESSAGES[e?.code] || e?.message || "Something went wrong.";
}
