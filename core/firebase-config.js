// Paste the config from Firebase console -> Project settings -> Your apps -> Web app.
// These values are NOT secrets: Firebase web config is meant to be public.
// Security comes from the rules in the MV-Backend repo.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Where each app lives. On GitHub Pages both sites share the origin
// https://arthwarrior3201.github.io, so the login session is shared too.
export const SITES = {
  musicvibe: "/MusicVibe/",
  proartists: "/ProArtists/",
};
