// From Supabase dashboard -> Project Settings -> API (or "API Keys").
// Use the Project URL and the PUBLIC key ("anon" or "publishable", starts with
// eyJ... or sb_publishable_...). Both are safe to publish: the database rules
// in MV-Backend protect the data.
// NEVER put the "service_role" / "secret" key here.
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_OR_PUBLISHABLE_KEY";

// Where each app lives. On GitHub Pages both sites share the origin
// https://arthwarrior3201.github.io, so the login session is shared too.
export const SITES = {
  musicvibe: "/MusicVibe/",
  proartists: "/ProArtists/",
};
