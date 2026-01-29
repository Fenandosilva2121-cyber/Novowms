
import { createClient } from '@supabase/supabase-js';

// No Vercel, estas variáveis devem ser configuradas no painel do projeto
const supabaseUrl = process.env.SUPABASE_URL || 'https://gtjtzwsnzsixwjxdkrhh.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RV26CLoCRQKgyc_DQcvG7A_I6Zs1r_I';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Atenção: Credenciais do Supabase não encontradas. Verifique as variáveis de ambiente.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
