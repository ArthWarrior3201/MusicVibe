import {
  auth, isConfigured, onAuthStateChanged, finishRedirectSignIn,
  signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword,
  createProfile, getProfile, isUsernameTaken, normalizeUsername, usernameProblem,
  friendlyError, safeNext, signOut,
} from "../core/mv.js";

const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
const next = safeNext(params.get("next"));

const forms = {
  signin: $("#form-signin"),
  signup: $("#form-signup"),
  reset: $("#form-reset"),
  username: $("#form-username"),
};
const COPY = {
  signin:   ["Welcome back", "Sign in to your feed and playlists."],
  signup:   ["Join MusicVibe", "Make playlists, follow artists, build your feed."],
  reset:    ["Reset password", "We'll email you a link to set a new one."],
  username: ["Pick your username", "This is how people find you on MusicVibe."],
};

let mode = "signin";
let busy = false; // stops the auth listener from redirecting mid sign-up

// ---------- mode switching ----------
function setMode(m, { keepAlert = false } = {}) {
  if (!forms[m]) m = "signin";
  mode = m;
  for (const [k, f] of Object.entries(forms)) f.hidden = k !== m;
  $("#title").textContent = COPY[m][0];
  $("#subtitle").textContent = COPY[m][1];
  $("#tabs").hidden = !(m === "signin" || m === "signup");
  $("#google-block").hidden = !(m === "signin" || m === "signup");
  $("#foot").hidden = m === "username";
  for (const b of $("#tabs").children) b.setAttribute("aria-selected", String(b.dataset.mode === m));
  if (!keepAlert) showAlert();
  const url = new URL(location.href);
  url.searchParams.set("mode", m);
  history.replaceState(null, "", url);
  forms[m].querySelector("input")?.focus();
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (b) setMode(b.dataset.mode);
});
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) {
    // carry the typed email over to the reset form
    const email = forms[mode].elements.email?.value;
    setMode(go.dataset.go);
    if (email && forms[mode].elements.email) forms[mode].elements.email.value = email;
  }
  const t = e.target.closest(".toggle-pw");
  if (t) {
    const input = t.previousElementSibling;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    t.textContent = show ? "Hide" : "Show";
  }
});

// ---------- helpers ----------
function showAlert(msg = "", kind = "error") {
  const a = $("#alert");
  a.className = "alert" + (msg ? ` show ${kind}` : "");
  a.textContent = msg;
}

async function withBusy(form, fn) {
  const btn = form.querySelector("button[type=submit]");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Please wait…";
  busy = true;
  showAlert();
  try {
    await fn();
  } catch (e) {
    console.error(e);
    showAlert(friendlyError(e));
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = label;
  }
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// ---------- username live check ----------
function wireUsername(form) {
  const input = form.elements.username;
  const hint = form.querySelector('[data-hint="username"]');
  let timer, seq = 0;
  input.addEventListener("input", () => {
    const clean = normalizeUsername(input.value.replace(/\s+/g, "_"));
    if (clean !== input.value) input.value = clean;
    clearTimeout(timer);
    const problem = usernameProblem(clean);
    if (!clean) { setHint(hint, "3–20 characters: letters, numbers, _ and ."); return; }
    if (problem) { setHint(hint, problem, "bad"); return; }
    setHint(hint, "Checking…");
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(clean);
        if (mine !== seq) return;
        setHint(hint, taken ? `@${clean} is taken` : `@${clean} is available`, taken ? "bad" : "ok");
      } catch { if (mine === seq) setHint(hint, ""); }
    }, 350);
  });
}
function setHint(el, text, kind = "") {
  el.textContent = text;
  el.className = "hint" + (kind ? " " + kind : "");
}
wireUsername(forms.signup);
wireUsername(forms.username);

// ---------- password meter ----------
{
  const pw = forms.signup.elements.password;
  const bar = forms.signup.querySelector(".pw-meter span");
  const hint = forms.signup.querySelector('[data-hint="password"]');
  pw.addEventListener("input", () => {
    const v = pw.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const levels = [["#f43f5e", "Too short"], ["#f43f5e", "Weak"], ["#f59e0b", "Okay"], ["#eab308", "Good"], ["#22c55e", "Strong"], ["#22c55e", "Very strong"]];
    const [color, text] = v.length < 8 ? levels[0] : levels[score];
    bar.style.width = `${Math.max(v.length ? 10 : 0, score * 20)}%`;
    bar.style.background = color;
    setHint(hint, v ? text : "At least 8 characters.", v.length < 8 && v ? "bad" : "");
  });
}

// ---------- submit handlers ----------
forms.signin.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const email = f.email.value.trim();
  if (!isEmail(email)) return showAlert("Enter a valid email.");
  if (!f.password.value) return showAlert("Enter your password.");
  withBusy(e.target, async () => {
    const user = await signInWithEmail({ email, password: f.password.value, remember: f.remember.checked });
    await routeSignedIn(user);
  });
});

forms.signup.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const displayName = f.displayName.value.trim();
  const username = normalizeUsername(f.username.value);
  const email = f.email.value.trim();
  if (!displayName) return showAlert("Add a display name.");
  const problem = usernameProblem(username);
  if (problem) return showAlert(`Username: ${problem}`);
  if (!isEmail(email)) return showAlert("Enter a valid email.");
  if (f.password.value.length < 8) return showAlert("Password needs at least 8 characters.");
  withBusy(e.target, async () => {
    await signUpWithEmail({ email, password: f.password.value, username, displayName, remember: f.remember.checked });
    location.replace(next);
  });
});

forms.reset.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = e.target.elements.email.value.trim();
  if (!isEmail(email)) return showAlert("Enter a valid email.");
  withBusy(e.target, async () => {
    try {
      await resetPassword(email);
    } catch (err) {
      // Don't reveal whether an account exists for this email.
      if (err.code !== "auth/user-not-found") throw err;
    }
    showAlert(`If an account exists for ${email}, a reset link is on its way. Check your inbox.`, "info");
  });
});

forms.username.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const displayName = f.displayName.value.trim();
  const username = normalizeUsername(f.username.value);
  if (!displayName) return showAlert("Add a display name.");
  const problem = usernameProblem(username);
  if (problem) return showAlert(`Username: ${problem}`);
  if (!auth.currentUser) return setMode("signin");
  withBusy(e.target, async () => {
    if (await isUsernameTaken(username)) throw Object.assign(new Error(), { code: "username-taken" });
    await createProfile(auth.currentUser, { username, displayName });
    location.replace(next);
  });
});

$("#cancel-setup").addEventListener("click", async () => {
  await signOut();
  setMode("signin");
});

$("#google-btn").addEventListener("click", (e) => {
  const remember = forms[mode].elements.remember?.checked ?? true;
  const btn = e.currentTarget;
  btn.disabled = true;
  busy = true;
  showAlert();
  signInWithGoogle({ remember })
    .then((user) => user && routeSignedIn(user))
    .catch((err) => { console.error(err); showAlert(friendlyError(err)); })
    .finally(() => { btn.disabled = false; busy = false; });
});

// ---------- routing ----------
// Signed in + has profile -> go to `next`. Signed in, no profile -> pick username.
async function routeSignedIn(user) {
  const profile = await getProfile(user.uid);
  if (profile) { location.replace(next); return; }
  setMode("username");
  const f = forms.username.elements;
  if (!f.displayName.value) f.displayName.value = user.displayName || "";
  // suggest a username from the Google name / email
  if (!f.username.value) {
    const base = normalizeUsername((user.displayName || user.email || "").split("@")[0]).replace(/[^a-z0-9_.]/g, "");
    if (base) { f.username.value = /^[a-z]/.test(base) ? base.slice(0, 20) : ("u" + base).slice(0, 20); f.username.dispatchEvent(new Event("input")); }
  }
}

// ---------- boot ----------
if (!isConfigured) {
  $("#config-warning").hidden = false;
  for (const b of document.querySelectorAll("button")) if (b.type === "submit" || b.id === "google-btn") b.disabled = true;
}

setMode(params.get("mode") || "signin");

if (isConfigured) {
  await finishRedirectSignIn();
  onAuthStateChanged(auth, (user) => {
    if (busy) return;
    if (user) routeSignedIn(user).catch((e) => showAlert(friendlyError(e)));
    else if (mode === "username") setMode("signin", { keepAlert: true });
  });
}
