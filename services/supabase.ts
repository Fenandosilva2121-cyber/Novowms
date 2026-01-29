
import { createClient } from '@supabase/supabase-js';

// No ambiente de desenvolvimento do navegador ou Vercel, o process.env é injetado.
const supabaseUrl = process.env.SUPABASE_URL || 'https://gtjtzwsnzsixwjxdkrhh.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RV26CLoCRQKgyc_DQcvG7A_I6Zs1r_I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
