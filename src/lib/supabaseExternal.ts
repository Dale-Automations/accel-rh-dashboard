import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pkygzwsszexleeaodufl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbG9wY3Bqb3B2YXBydm56eHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTMxMDcsImV4cCI6MjA4Njc2OTEwN30.9PomkZjJzP6HmrDA5DW1MqlKc43nJBNvcyT5fdCHgKI';

export const supabaseExternal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
