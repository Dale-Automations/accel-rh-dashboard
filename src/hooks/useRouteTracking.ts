import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackAction } from '@/lib/userActivity';
import type { ActionType } from '@/lib/userActionsRegistry';

const PATH_TO_ACTION: Record<string, ActionType> = {
  '/vacantes': 'view_vacancies',
  '/archivados': 'view_archivados',
  '/informes': 'view_informes',
  '/rubricas': 'view_rubricas',
  '/usuarios': 'view_usuarios',
  '/facturacion': 'view_facturacion',
};

/**
 * Hook que escucha cambios de ruta y trackea vistas a páginas top-level.
 * Mount en AppLayout para cubrir toda la app con 1 sola línea.
 */
export function useRouteTracking() {
  const location = useLocation();
  useEffect(() => {
    const action = PATH_TO_ACTION[location.pathname];
    if (action) trackAction(action);
  }, [location.pathname]);
}
