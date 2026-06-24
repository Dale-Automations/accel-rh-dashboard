import { useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;

export interface OrgOnboardingProgress {
  loading: boolean;
  jdDone: boolean;
  vacancyDone: boolean;
  rubricaDone: boolean;
  candidatesDone: boolean;
  scoredDone: boolean;
  latestVacancyId: string | null;
  latestRubricaVacancyId: string | null;
  reload: () => Promise<void>;
}

/**
 * Hook que deriva los flags de completitud de cada paso del onboarding,
 * scoped a la organization_id del user autenticado.
 *
 * Cada flag es true cuando hay >= 1 fila relevante en la tabla correspondiente.
 * Tambien retorna `latestVacancyId` (la vacancy mas reciente de la org) para
 * que las cards puedan CTA-ear a la vacancy concreta del usuario.
 */
export function useOrgOnboardingProgress(organizationId: string | undefined | null): OrgOnboardingProgress {
  const [state, setState] = useState<Omit<OrgOnboardingProgress, 'reload'>>({
    loading: true,
    jdDone: false,
    vacancyDone: false,
    rubricaDone: false,
    candidatesDone: false,
    scoredDone: false,
    latestVacancyId: null,
    latestRubricaVacancyId: null,
  });

  const load = async () => {
    if (!organizationId) {
      setState({
        loading: false,
        jdDone: false,
        vacancyDone: false,
        rubricaDone: false,
        candidatesDone: false,
        scoredDone: false,
        latestVacancyId: null,
        latestRubricaVacancyId: null,
      });
      return;
    }
    const [jdRes, vacRes, latestVacRes, rubRes, latestRubRes, postRes, scoreRes] = await Promise.all([
      sb.from('client_jd_sessions').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      sb.from('vacantes').select('vacancy_id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      sb.from('vacantes').select('vacancy_id').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1),
      sb.from('rubricas').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
      sb.from('rubricas').select('vacancy_id').eq('organization_id', organizationId).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('organization_id', organizationId),
      sb.from('cv_scores').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    ]);

    setState({
      loading: false,
      jdDone: (jdRes.count ?? 0) > 0,
      vacancyDone: (vacRes.count ?? 0) > 0,
      rubricaDone: (rubRes.count ?? 0) > 0,
      candidatesDone: (postRes.count ?? 0) > 0,
      scoredDone: (scoreRes.count ?? 0) > 0,
      latestVacancyId: latestVacRes.data?.[0]?.vacancy_id ?? null,
      latestRubricaVacancyId: latestRubRes.data?.[0]?.vacancy_id ?? null,
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  return { ...state, reload: load };
}
