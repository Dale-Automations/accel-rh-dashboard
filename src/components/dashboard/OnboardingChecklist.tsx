import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrgOnboardingProgress } from '@/hooks/useOrgOnboardingProgress';
import { Sparkles, Briefcase, ClipboardCheck, UsersRound, Brain, CheckCircle2, X, Lock, Upload, Target, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const sb = supabase as any;

type CardKey = 'jd' | 'vacancy' | 'rubrica' | 'candidates' | 'evaluate';

interface CardSpec {
  key: CardKey;
  icon: LucideIcon;
  title: string;
  description: string;
  done: boolean;
  available: boolean;
  lockedReason?: string;
}

/**
 * Onboarding checklist en el Home para enterprise/manager de orgs sin clientes externos.
 *
 * 5 cards en secuencia: armar JD -> abrir vacante -> rubrica -> cargar candidatos -> evaluar.
 * Cada card tiene estado done (check verde) / available (CTA activo) / locked (CTA disabled).
 * Dismissable individualmente; cuando todas estan dismissed o done, el modulo se oculta.
 */
export function OnboardingChecklist() {
  const navigate = useNavigate();
  const { user, profile, role, hasExternalClients, organization, refreshProfile } = useAuth();
  const progress = useOrgOnboardingProgress(organization?.id);
  const [dismissing, setDismissing] = useState<CardKey | null>(null);

  const dismissed: string[] = useMemo(() => {
    return (profile?.preferences as any)?.onboarding_dismissed ?? [];
  }, [profile?.preferences]);

  const isEligibleRole = role === 'enterprise' || role === 'manager';
  if (!isEligibleRole || hasExternalClients) return null;
  if (progress.loading) return null;

  const targetVacancyId = progress.latestRubricaVacancyId || progress.latestVacancyId;

  const cards: CardSpec[] = [
    {
      key: 'jd',
      icon: Sparkles,
      title: 'Armá tu primer Job Description con IA',
      description: 'El wizard te ayuda a redactar la descripción del puesto, la rúbrica y un guion para entrevistar. En 5 minutos lo tenés.',
      done: progress.jdDone,
      available: true,
    },
    {
      key: 'vacancy',
      icon: Briefcase,
      title: 'Abrí tu primera vacante',
      description: 'Cuando el wizard termina, la sesión queda esperando que un manager apruebe y abra la vacante en el sistema.',
      done: progress.vacancyDone,
      available: progress.jdDone,
      lockedReason: 'Armá primero un JD con IA.',
    },
    {
      key: 'rubrica',
      icon: ClipboardCheck,
      title: 'Creá la rúbrica de evaluación',
      description: 'La rúbrica le indica a la IA qué criterios pesar al evaluar a los candidatos (técnicos + actitudinales).',
      done: progress.rubricaDone,
      available: progress.vacancyDone,
      lockedReason: 'Primero abrí una vacante.',
    },
    {
      key: 'candidates',
      icon: UsersRound,
      title: 'Cargá tus primeros candidatos',
      description: 'Subí CVs manualmente o lanzá una búsqueda en LinkedIn para que el sistema te traiga perfiles potenciales.',
      done: progress.candidatesDone,
      available: progress.vacancyDone,
      lockedReason: 'Primero abrí una vacante.',
    },
    {
      key: 'evaluate',
      icon: Brain,
      title: 'Evaluá tus candidatos con IA',
      description: 'Apretás un botón y la IA corre el recorrido completo: pre-filtro local, evaluación con tu rúbrica y refinamiento de los mejores.',
      done: progress.scoredDone,
      available: progress.rubricaDone && progress.candidatesDone,
      lockedReason: 'Necesitás rúbrica activa y al menos un candidato cargado.',
    },
  ];

  const visibleCards = cards.filter(c => !dismissed.includes(c.key) && !c.done);
  if (visibleCards.length === 0) return null;

  const handleDismiss = async (key: CardKey) => {
    if (!user?.id) return;
    setDismissing(key);
    try {
      const prev = (profile?.preferences ?? {}) as any;
      const newPrefs = {
        ...prev,
        onboarding_dismissed: Array.from(new Set([...(prev.onboarding_dismissed ?? []), key])),
      };
      await sb.from('user_profiles').update({ preferences: newPrefs }).eq('id', user.id);
      await refreshProfile();
    } finally {
      setDismissing(null);
    }
  };

  const navigateCTA = (key: CardKey, target?: 'manual' | 'linkedin') => {
    switch (key) {
      case 'jd':
        navigate('/armar-vacante');
        break;
      case 'vacancy':
        navigate('/jd-sessions');
        break;
      case 'rubrica':
        navigate(targetVacancyId ? `/rubricas/${targetVacancyId}` : '/rubricas');
        break;
      case 'candidates':
        if (!progress.latestVacancyId) {
          navigate('/vacantes');
          break;
        }
        if (target === 'linkedin') {
          navigate(`/vacantes/${progress.latestVacancyId}#solicitar-headhunting`);
        } else {
          navigate(`/vacantes/${progress.latestVacancyId}#bulk-import`);
        }
        break;
      case 'evaluate':
        navigate(progress.latestVacancyId ? `/vacantes/${progress.latestVacancyId}#evaluar` : '/vacantes');
        break;
    }
  };

  return (
    <Card className="border-violet-200 bg-violet-50/40">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-violet-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Primeros pasos en AccelRH
            </h2>
            <p className="text-xs text-violet-900/70 mt-0.5">
              Guía rápida para arrancar a buscar candidatos con IA.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {visibleCards.map((c) => {
            const Icon = c.icon;
            const isCandidatesCard = c.key === 'candidates';
            return (
              <div
                key={c.key}
                className={cn(
                  'rounded-md bg-background border p-3 flex items-start gap-3 transition-colors',
                  c.available ? 'border-violet-200 hover:border-violet-400' : 'border-zinc-200 opacity-60',
                )}
              >
                <div className={cn('mt-0.5 h-8 w-8 rounded-md flex items-center justify-center shrink-0',
                  c.available ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 text-zinc-500',
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{c.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                  {!c.available && c.lockedReason && (
                    <div className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> {c.lockedReason}
                    </div>
                  )}
                  {c.available && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {isCandidatesCard ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => navigateCTA(c.key, 'manual')}>
                            <Upload className="h-3.5 w-3.5 mr-1.5" /> Subir CV manual
                          </Button>
                          <Button size="sm" onClick={() => navigateCTA(c.key, 'linkedin')}>
                            <Target className="h-3.5 w-3.5 mr-1.5" /> Buscar en LinkedIn
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => navigateCTA(c.key)}>
                          {c.key === 'jd' && 'Abrir wizard'}
                          {c.key === 'vacancy' && 'Ver mis solicitudes'}
                          {c.key === 'rubrica' && 'Editar rúbrica'}
                          {c.key === 'evaluate' && 'Evaluar candidatos'}
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="text-muted-foreground hover:text-foreground shrink-0 mt-1"
                  onClick={() => handleDismiss(c.key)}
                  disabled={dismissing === c.key}
                  title="Ocultar este paso"
                >
                  {dismissing === c.key ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {progress.scoredDone && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
            <CheckCircle2 className="h-4 w-4" />
            ¡Buen trabajo! Ya tenés candidatos evaluados con IA en tu organización.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
