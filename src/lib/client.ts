import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export async function identify() {
  if (!db) throw new Error("Configure o Supabase seguindo o README.");
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user.id;
  const result = await db.auth.signInAnonymously();
  if (result.error) throw result.error;
  return result.data.user!.id;
}
