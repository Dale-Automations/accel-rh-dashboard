import { useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;

let cachedEtapas: string[] | null = null;

export function useEtapas() {
  const [etapas, setEtapas] = useState<string[]>(cachedEtapas || []);
  const [loading, setLoading] = useState(!cachedEtapas);

  const loadEtapas = async () => {
    const { data } = await sb.from('etapas').select('name, sort_order').order('sort_order', { ascending: true });
    const names = (data || []).map((e: any) => e.name);
    cachedEtapas = names;
    setEtapas(names);
    setLoading(false);
  };

  useEffect(() => {
    if (!cachedEtapas) loadEtapas();
  }, []);

  const addEtapa = async (name: string) => {
    const maxOrder = cachedEtapas ? cachedEtapas.length + 1 : 1;
    const { error } = await sb.from('etapas').insert({ name, sort_order: maxOrder });
    if (error) throw error;
    cachedEtapas = null;
    await loadEtapas();
  };

  return { etapas, loading, addEtapa, reload: loadEtapas };
}
