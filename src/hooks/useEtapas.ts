import { useEffect, useMemo, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;

let cachedEtapas: string[] | null = null;

const CLIENT_STAGE_NAMES = ['Enviado a cliente', 'Aceptado por Cliente', 'Rechazado por cliente'];

interface UseEtapasOptions {
  /** Si true, oculta las etapas relacionadas al cliente (uso en orgs sin clientes externos). */
  filterClientStages?: boolean;
}

export function useEtapas(options: UseEtapasOptions = {}) {
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

  const filteredEtapas = useMemo(
    () => (options.filterClientStages ? etapas.filter(e => !CLIENT_STAGE_NAMES.includes(e)) : etapas),
    [etapas, options.filterClientStages],
  );

  return { etapas: filteredEtapas, loading, addEtapa, reload: loadEtapas };
}
