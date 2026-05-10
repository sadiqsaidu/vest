import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error(
      "Supabase env not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings.",
    );
  }
  // Strip a trailing slash and any accidental REST/storage path the user may
  // have pasted from the Supabase dashboard. The supabase-js client builds
  // its own /rest/v1/* paths and expects only the project origin.
  let url = rawUrl.trim().replace(/\/+$/, "");
  url = url.replace(/\/(rest|storage)\/v\d+$/, "");
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is malformed: "${rawUrl}". Expected something like https://<project>.supabase.co`,
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
