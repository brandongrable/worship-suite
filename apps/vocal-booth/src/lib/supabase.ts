import { createClient } from '@supabase/supabase-js';
import type { Database } from '@worship/db';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url) throw new Error('VITE_SUPABASE_URL is not set in .env.local');
if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY is not set in .env.local');

export const supabase = createClient<Database>(url, anonKey);
