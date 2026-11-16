// From Supabase dashboard -> Project Settings -> API (or "API Keys").
// Use the Project URL and the PUBLIC key ("anon" or "publishable", starts with
// eyJ... or sb_publishable_...). Both are safe to publish: the database rules
// in MV-Backend protect the data.
// NEVER put the "service_role" / "secret" key here.
export const SUPABASE_URL = "https://asuvocgnexepodycgkyp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_8bfS-arj_U_CtTt_wMjqmw_ZhI4cTo";

// Your Vercel deployment of MV-Storage (no trailing slash), e.g. https://mv-storage.vercel.app
export const API_BASE = "https://mv-storage.vercel.app";

// Where each app lives. On GitHub Pages both sites share the origin
// https://arthwarrior3201.github.io, so the login session is shared too.
export const SITES = {
  musicvibe: "/MusicVibe/",
  proartists: "/ProArtists/",
};
