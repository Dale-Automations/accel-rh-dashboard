import { useCallback, useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { DAILY_PROFILE_CAP, SCRAPE_BATCH } from '@/lib/huntingConfig';

const sb = supabase as any;

export interface HuntingUsage {
  profilesToday: number;   // perfiles visitados hoy (finished) + estimado de tandas en curso
  batchesToday: number;    // cantidad de lanzamientos del scraper hoy
  cap: number;
  near: boolean;           // >= 80% del límite
  atLimit: boolean;        // >= límite
  loading: boolean;
  refresh: () => void;
}

// Calcula el uso de LinkedIn del día desde hunting_runs (zona horaria Buenos Aires).
export function useHuntingUsage(): HuntingUsage {
  const [profilesToday, setProfilesToday] = useState(0);
  const [batchesToday, setBatchesToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const baDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      const since = `${baDate}T00:00:00-03:00`;
      const { data } = await sb
        .from('hunting_runs')
        .select('profiles_count,status,started_at')
        .gte('started_at', since);
      const rows = (data || []) as Array<{ profiles_count: number | null; status: string }>;
      const finished = rows
        .filter(r => r.status === 'finished')
        .reduce((s, r) => s + (r.profiles_count || 0), 0);
      const active = rows.filter(r => r.status === 'launched' || r.status === 'scraping').length;
      // Las tandas en curso aún no tienen profiles_count → estimamos el batch para el freno.
      setProfilesToday(finished + active * SCRAPE_BATCH);
      setBatchesToday(rows.filter(r => r.status !== 'error').length);
    } catch {
      setProfilesToday(0);
      setBatchesToday(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    profilesToday,
    batchesToday,
    cap: DAILY_PROFILE_CAP,
    near: profilesToday >= DAILY_PROFILE_CAP * 0.8,
    atLimit: profilesToday >= DAILY_PROFILE_CAP,
    loading,
    refresh: load,
  };
}
