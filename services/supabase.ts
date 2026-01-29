
import { createClient } from '@supabase/supabase-js';

// Função para obter valores de forma segura
const getEnv = (key: string, fallback: string) => {
  try {
    return (window as any).process?.env?.[key] || (process?.env?.[key]) || fallback;
  } catch {
    return fallback;
  }
};

const supabaseUrl = getEnv('SUPABASE_URL', 'https://gtjtzwsnzsixwjxdkrhh.supabase.co');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY', 'sb_publishable_RV26CLoCRQKgyc_DQcvG7A_I6Zs1r_I');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
