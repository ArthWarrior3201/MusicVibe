import {
  isConfigured, currentUser, onAuthChange,
  signInWithEmail, signUpWithEmail, resetPassword, updatePassword, verifySignupCode, verifyResetCode,
  resendConfirmation, createProfile, getProfile, isUsernameTaken, normalizeUsername,
  usernameProblem, friendlyError, safeNext, signOut, appFor, notifySignIn,
} from "../core/mv.js";

const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
const next = safeNext(params.get("next"));
const app = appFor(next); // "artist" when coming from ProArtists

const forms = {
  signin: $("#form-signin"),
  signup: $("#form-signup"),
  reset: $("#form-reset"),
  code: $("#form-code"),
  newpassword: $("#form-newpassword"),
  username: $("#form-username"),
};
const COPY = {
  signin:      ["Welcome back", "Sign in to your feed and playlists."],
  signup:      ["Join MusicVibe", "Make playlists, follow artists, build your feed."],
  reset:       ["Reset password", "We'll email you a code to set a new one."],
  code:        ["Check your email", "Enter the code to continue."],
  newpassword: ["Set a new password", "Choose a new password for your account."],
  username:    ["Pick your username", "This is how people find you on MusicVibe."],
};

if (app === "artist") {
  COPY.signin = ["Welcome back, artist", "Sign in to your ProArtists studio."];
  COPY.signup = ["Join ProArtists", "Create your account, then set up your artist profile."];
  $(".brand").lastChild.textContent = " ProArtists";
  $(".brand").href = "../ProArtists/";
  $("#foot").innerHTML = 'Just here to listen? <a href="./">Go to MusicVibe</a>.';
  document.title = "Sign in · ProArtists";
}

let mode = "signin";
let codeEmail = "";
let codePurpose = "signup"; // "signup" | "recovery"

function goCode(email, purpose, message) {
  codeEmail = email;
  codePurpose = purpose;
  setMode("code");
  $("#code-email").textContent = email;
  forms.code.reset();
  if (message) showAlert(message, "info");
}
let busy = false; // stops the auth listener from redirecting mid-action

// ---------- mode switching ----------
function setMode(m, { keepAlert = false } = {}) {
  if (!forms[m]) m = "signin";
  mode = m;
  for (const [k, f] of Object.entries(forms)) f.hidden = k !== m;
  $("#title").textContent = COPY[m][0];
  $("#subtitle").textContent = COPY[m][1];
  const entry = m === "signin" || m === "signup";
  $("#tabs").hidden = !entry;
  $("#foot").hidden = !entry;
  for (const b of $("#tabs").children) b.setAttribute("aria-selected", String(b.dataset.mode === m));
  if (!keepAlert) showAlert();
  const url = new URL(location.href);
  url.searchParams.set("mode", m);
  url.hash = "";
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
    const email = forms[mode].elements.email?.value; // carry the typed email over
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
function setHint(el, text, kind = "") {
  el.textContent = text;
  el.className = "hint" + (kind ? " " + kind : "");
}

// ---------- username live check ----------
function wireUsername(form) {
  const input = form.elements.username;
  const hint = form.querySelector('[data-hint="username"]');
  let timer, seq = 0;
  input.addEventListener("input", () => {
    const clean = normalizeUsername(input.value);
    if (clean !== input.value) input.value = clean;
    clearTimeout(timer);
    const mine = ++seq;
    if (!clean) return setHint(hint, "3–20 characters: letters, numbers, _ and .");
    const problem = usernameProblem(clean);
    if (problem) return setHint(hint, problem, "bad");
    if (!isConfigured) return setHint(hint, "");
    setHint(hint, "Checking…");
    timer = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(clean);
        if (mine !== seq) return;
        setHint(hint, taken ? `@${clean} is taken` : `@${clean} is available`, taken ? "bad" : "ok");
      } catch { if (mine === seq) setHint(hint, ""); }
    }, 350);
  });
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
    try {
      const user = await signInWithEmail({ email, password: f.password.value, remember: f.remember.checked });
      notifySignIn({ app, method: "password" });
      await routeSignedIn(user);
    } catch (err) {
      if (err.code !== "email_not_confirmed") throw err;
      await resendConfirmation(email, next).catch(() => {});
      goCode(email, "signup", "Your email isn't verified yet. We just sent you a new code.");
    }
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
    const { needsConfirmation } = await signUpWithEmail({
      email, password: f.password.value, username, displayName, remember: f.remember.checked, next,
    });
    if (!needsConfirmation) { location.replace(next); return; }
    e.target.reset();
    goCode(email, "signup");
  });
});

forms.reset.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = e.target.elements.email.value.trim();
  if (!isEmail(email)) return showAlert("Enter a valid email.");
  withBusy(e.target, async () => {
    await resetPassword(email, next);
    // Same screen either way, so nobody can test which emails have accounts.
    goCode(email, "recovery", "If an account exists for this email, a code is on its way.");
  });
});

forms.code.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = e.target.elements.code.value.replace(/\D/g, "");
  if (code.length < 6) return showAlert("Enter the code from the email.");
  withBusy(e.target, async () => {
    if (codePurpose === "signup") {
      const user = await verifySignupCode(codeEmail, code);
      await routeSignedIn(user);
    } else {
      await verifyResetCode(codeEmail, code);
      setMode("newpassword");
    }
  });
});

forms.code.elements.code.addEventListener("input", (e) => {
  const v = e.target.value.replace(/\D/g, "");
  if (v !== e.target.value) e.target.value = v;
});

$("#code-resend").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    if (codePurpose === "signup") await resendConfirmation(codeEmail, next);
    else await resetPassword(codeEmail, next);
    showAlert("New code sent. Check your inbox (and spam).", "info");
  } catch (err) { showAlert(friendlyError(err)); }
  setTimeout(() => { btn.disabled = false; }, 30000); // don't burn the email quota
});

$("#code-back").addEventListener("click", () => {
  setMode(codePurpose === "signup" ? "signup" : "reset");
  if (forms[mode].elements.email) forms[mode].elements.email.value = codeEmail;
});

forms.newpassword.addEventListener("submit", (e) => {
  e.preventDefault();
  const pw = e.target.elements.password.value;
  if (pw.length < 8) return showAlert("Password needs at least 8 characters.");
  withBusy(e.target, async () => {
    await updatePassword(pw);
    const user = await currentUser();
    showAlert("Password updated. Signing you in…", "info");
    if (user) await routeSignedIn(user);
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
  withBusy(e.target, async () => {
    const user = await currentUser();
    if (!user) return setMode("signin");
    if (await isUsernameTaken(username)) throw Object.assign(new Error(), { code: "username-taken" });
    await createProfile(user, { username, displayName });
    location.replace(next);
  });
});

$("#cancel-setup").addEventListener("click", async () => {
  await signOut();
  setMode("signin");
});

// ---------- routing ----------
// Signed in + has profile -> go to `next`. Signed in, no profile -> pick username.
async function routeSignedIn(user) {
  const profile = await getProfile(user.id);
  if (profile) { location.replace(next); return; }
  setMode("username", { keepAlert: true });
  const f = forms.username.elements;
  const meta = user.user_metadata || {};
  if (!f.displayName.value) f.displayName.value = (meta.full_name || meta.name || "").slice(0, 50);
  if (!f.username.value) {
    // suggest one from their name / email
    const base = normalizeUsername((meta.full_name || meta.name || user.email || "").split("@")[0]).replace(/[^a-z0-9_.]/g, "");
    if (base) {
      f.username.value = (/^[a-z]/.test(base) ? base : "u" + base).slice(0, 20);
      f.username.dispatchEvent(new Event("input"));
    }
  }
}

// Errors Supabase puts in the URL, e.g. an expired email link.
function urlError() {
  const h = new URLSearchParams(location.hash.slice(1));
  const code = h.get("error_code") || params.get("error_code");
  const desc = h.get("error_description") || params.get("error_description");
  if (!code && !desc) return null;
  return friendlyError({ code, message: desc?.replace(/\+/g, " ") });
}

// ---------- boot ----------
if (!isConfigured) {
  $("#config-warning").hidden = false;
  for (const b of document.querySelectorAll("button[type=submit]")) b.disabled = true;
}

const linkError = urlError();
const requested = ["code"].includes(params.get("mode")) ? "signin" : (params.get("mode") || "signin");

if (isConfigured) {
  // Waits for supabase-js to finish reading any sign-in / reset tokens from the URL.
  const user = await currentUser();

  if (linkError) {
    setMode(requested === "newpassword" ? "reset" : "signin");
    showAlert(linkError);
  } else if (requested === "newpassword") {
    if (user) setMode("newpassword");
    else { setMode("reset"); showAlert("That reset link has expired. Request a new one."); }
  } else if (user) {
    setMode(requested === "username" ? "username" : requested);
    routeSignedIn(user).catch((e) => showAlert(friendlyError(e)));
  } else {
    setMode(requested === "username" ? "signin" : requested);
  }

  onAuthChange((event, u) => {
    if (busy || mode === "newpassword") return;
    if (event === "SIGNED_IN" && u) setTimeout(() => routeSignedIn(u).catch((e) => showAlert(friendlyError(e))));
    if (event === "SIGNED_OUT" && mode === "username") setMode("signin", { keepAlert: true });
  });
} else {
  setMode(requested === "username" || requested === "newpassword" ? "signin" : requested);
  if (linkError) showAlert(linkError);
}
