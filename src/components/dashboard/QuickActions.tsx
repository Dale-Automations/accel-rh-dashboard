import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { HelpCircle, Briefcase } from 'lucide-react';
import {
  ACTION_REGISTRY,
  DEFAULT_ACTIONS_BY_ROLE,
  NEVER_AS_TILE,
  type ActionType,
  type RoleScope,
  type ActionTile,
} from '@/lib/userActionsRegistry';

type Role = 'manager' | 'selectora' | 'cliente' | string | null | undefined;

const DYNAMIC_SLOTS = 4;

interface RenderTile {
  key: string;
  tile: ActionTile;
  isCustom?: boolean;
  onClick?: () => void;
}

function rankByCounts(counts: Record<string, number>, role: RoleScope): ActionType[] {
  return (Object.entries(counts) as Array<[string, number]>)
    .filter(([k]) => {
      const t = ACTION_REGISTRY[k as ActionType];
      if (!t) return false;
      if (NEVER_AS_TILE.has(k as ActionType)) return false;
      return t.visibleFor.includes(role);
    })
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => k as ActionType);
}

export function QuickActions({ role, onOpenHelp }: { role: Role; onOpenHelp: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const tiles: RenderTile[] = useMemo(() => {
    const r = (role as RoleScope) || 'manager';
    const counts = profile?.preferences?.action_counts || {};
    const ranked = rankByCounts(counts, r);

    // Pick top DYNAMIC_SLOTS, completar con defaults del rol sin duplicar
    const picked = new Set<ActionType>();
    const dynamic: ActionType[] = [];
    for (const a of ranked) {
      if (dynamic.length >= DYNAMIC_SLOTS) break;
      if (!picked.has(a)) {
        dynamic.push(a);
        picked.add(a);
      }
    }
    for (const a of DEFAULT_ACTIONS_BY_ROLE[r] || []) {
      if (dynamic.length >= DYNAMIC_SLOTS) break;
      const t = ACTION_REGISTRY[a];
      if (!t || !t.visibleFor.includes(r) || NEVER_AS_TILE.has(a)) continue;
      if (!picked.has(a)) {
        dynamic.push(a);
        picked.add(a);
      }
    }

    const dynTiles: RenderTile[] = dynamic.map(a => ({ key: a, tile: ACTION_REGISTRY[a] }));

    // 2 fijos finales
    const fixed: RenderTile[] = [];
    if (!picked.has('view_vacancies')) {
      fixed.push({ key: 'view_vacancies', tile: ACTION_REGISTRY.view_vacancies });
    } else {
      // Si ya está como dinámico, ponemos un placeholder de "ver archivadas" como variante
      const arch = ACTION_REGISTRY.view_archivados;
      if (arch.visibleFor.includes(r) && !picked.has('view_archivados')) {
        fixed.push({ key: 'view_archivados', tile: arch });
      } else {
        // Solo cliente cae acá: dejamos un único tile de catch-all
        fixed.push({
          key: '__catch_all__',
          tile: {
            title: 'Ver todas las vacantes',
            desc: 'Listado completo',
            icon: Briefcase,
            to: '/vacantes',
            visibleFor: [r],
            color: 'text-violet-600',
          },
        });
      }
    }
    fixed.push({
      key: '__help__',
      tile: {
        title: 'Tutoriales y FAQ',
        desc: 'Cómo usar el sistema, paso a paso',
        icon: HelpCircle,
        customAction: 'open_help',
        visibleFor: [r],
        color: 'text-rose-600',
      },
      isCustom: true,
      onClick: onOpenHelp,
    });

    return [...dynTiles, ...fixed];
  }, [role, profile?.preferences?.action_counts, onOpenHelp]);

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Accesos rápidos
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map(({ key, tile, onClick }) => {
          const Icon = tile.icon;
          return (
            <Card
              key={key}
              className="p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => {
                if (onClick) onClick();
                else if (tile.to) navigate(tile.to);
              }}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 p-2 rounded-lg bg-muted/50 ${tile.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{tile.title}</p>
                  {tile.desc && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{tile.desc}</p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
