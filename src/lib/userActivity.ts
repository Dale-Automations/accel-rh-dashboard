import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import type { ActionType } from '@/lib/userActionsRegistry';

const sb = supabase as any;

// Throttle: no contar más de 1 vez la misma acción en menos de THROTTLE_MS.
const THROTTLE_MS = 2000;
const lastFired: Record<string, number> = {};

/**
 * Fire-and-forget tracking. Increments a counter on the authenticated user's
 * preferences.action_counts JSONB via the SECURITY DEFINER function
 * `increment_user_action`. No await, no UI blocking.
 *
 * Gracefully degrades: si la RPC no existe en la DB todavía (migration no
 * corrida) o el user no está autenticado, simplemente loguea warn y sigue.
 */
export function trackAction(type: ActionType): void {
  const now = Date.now();
  const last = lastFired[type] ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastFired[type] = now;

  try {
    sb.rpc('increment_user_action', { p_action: type })
      .then((res: any) => {
        if (res?.error) {
          // RPC missing o sin permisos → no romper la UX, solo warn una vez
          console.warn('[userActivity] RPC failed:', res.error.message || res.error);
        }
      })
      .catch((err: any) => {
        console.warn('[userActivity] RPC threw:', err?.message || err);
      });
  } catch (e: any) {
    console.warn('[userActivity] track failed:', e?.message || e);
  }
}
