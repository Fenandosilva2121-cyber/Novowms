
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gtjtzwsnzsixwjxdkrhh.supabase.co';
const supabaseAnonKey = 'sb_publishable_RV26CLoCRQKgyc_DQcvG7A_I6Zs1r_I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
