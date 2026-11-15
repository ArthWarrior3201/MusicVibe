# MusicVibe

The main app: sign up / sign in, your feed, playlists.
Live at **https://arthwarrior3201.github.io/MusicVibe/**

Part of three repos:

* **MusicVibe** (this repo): listeners: accounts, feed, playlists. Also hosts the shared login code in `core/`.
* **ProArtists**: artist profiles, song uploads, collaborators.
* **MV-Backend**: Firebase security rules + setup docs.

## Pages

| File | What |
|---|---|
| `index.html` | Landing page (skips to the app if you're signed in) |
| `auth.html` | Sign in · Sign up · Forgot password · Pick username. Choose a mode with `?mode=signin\|signup\|reset\|username`, and set where to go afterwards with `&next=/path` |
| `app.html` | Signed-in home (feed placeholder) |

## Shared core (`core/`)

* `firebase-config.js`: **paste your Firebase web config here** (it's safe to make public)
* `mv.js`: Firebase setup + `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `resetPassword`,
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

Then open http://localhost:8000/MusicVibe/ (`localhost` is already an authorized domain in Firebase).
