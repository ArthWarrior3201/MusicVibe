# MusicVibe

The main app: sign up / sign in, your feed, playlists.
Live at **https://arthwarrior3201.github.io/MusicVibe/**

Part of three repos:

* **MusicVibe** (this repo): listeners: accounts, feed, playlists. Also hosts the shared login code in `core/`.
* **ProArtists**: artist profiles, song uploads, collaborators.
* **MV-Backend**: Supabase database + permission rules, setup docs.
* **MV-Storage** (private): Vercel API: song uploads/streaming (stored in that repo) and all emails.

## Pages

| File | What |
|---|---|
| `index.html` | Landing page (skips to the app if you're signed in) |
| `auth.html` | Sign in · Sign up · Forgot password · Set new password · Pick username. Choose a mode with `?mode=signin\|signup\|reset\|newpassword\|username`, and set where to go afterwards with `&next=/path` |
| `app.html` | Signed-in home (feed placeholder) |

## Shared core (`core/`)

* `supabase-config.js`: **paste your Supabase Project URL + anon/publishable key, and your Vercel URL (`API_BASE`) here** (all safe to make public; never the service_role key)
* `mv.js`: Supabase client + `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `resetPassword`, `updatePassword`, `uploadAudio`, `mediaUrl`, `deleteMedia`, `notifySignIn`,
  `requireUser()` (page guard), username helpers, friendly error messages.

ProArtists imports `/MusicVibe/core/mv.js` directly, so don't rename this folder.

## GitHub Pages

Settings → Pages → Deploy from branch → `main` / root.

## Run locally

Pages use `/MusicVibe/...` paths, so serve the folder **above** this repo with matching names:

```bash
mkdir -p ~/mv-site && ln -s "$PWD" ~/mv-site/MusicVibe && ln -s "$PWD/../ProArtists" ~/mv-site/ProArtists
```

```bash
cd ~/mv-site && python3 -m http.server 8000
```

Then open http://localhost:8000/MusicVibe/ (add `http://localhost:8000/MusicVibe/auth.html**` to Supabase → Authentication → URL Configuration → Redirect URLs).
