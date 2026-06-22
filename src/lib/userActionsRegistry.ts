import {
  Briefcase, Archive, FileText, Sparkles, Users, DollarSign,
  Plus, UserPlus, Upload, Star, Send, XCircle, RotateCcw, Trash2, MessageSquare,
  Wand2, ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export type ActionType =
  | 'view_vacancies'
  | 'view_archivados'
  | 'view_informes'
  | 'view_rubricas'
  | 'view_usuarios'
  | 'view_facturacion'
  | 'create_vacancy'
  | 'add_candidate_single'
  | 'add_candidate_bulk'
  | 'score_candidate'
  | 'send_screening_email'
  | 'close_vacancy'
  | 'reopen_vacancy'
  | 'delete_candidate'
  | 'chat_with_assistant'
  | 'start_jd_wizard'
  | 'review_jd_sessions';

export type RoleScope = 'manager' | 'selectora' | 'cliente';

export interface ActionTile {
  title: string;
  desc: string;
  icon: LucideIcon;
  to?: string;            // navigate target (if not custom action)
  customAction?: 'open_help'; // for non-navigation tiles
  visibleFor: RoleScope[];
  color: string;
}

/**
 * Registry maps each tracked action to a UI tile that can be surfaced in QuickActions.
 *
 * Note: "view_*" actions track *navigation* (so we know what pages the user visits most),
 * but the resulting tile points to that section so clicking it goes there too.
 * Actions like "delete_candidate" are tracked (so we know what they do) but
 * surfacing it as a tile makes little sense — they're filtered out at render time
 * via DISPLAY_AS_TILE below.
 */
export const ACTION_REGISTRY: Record<ActionType, ActionTile> = {
  view_vacancies: {
    title: 'Ver todas las vacantes',
    desc: 'Listado completo con filtros y búsqueda',
    icon: Briefcase,
    to: '/vacantes',
    visibleFor: ['manager', 'selectora', 'cliente'],
    color: 'text-violet-600',
  },
  view_archivados: {
    title: 'Vacantes archivadas',
    desc: 'Histórico de vacantes cerradas',
    icon: Archive,
    to: '/archivados',
    visibleFor: ['manager', 'selectora'],
    color: 'text-slate-600',
  },
  view_informes: {
    title: 'Informes',
    desc: 'Reporte de evaluaciones y métricas',
    icon: FileText,
    to: '/informes',
    visibleFor: ['manager'],
    color: 'text-emerald-600',
  },
  view_rubricas: {
    title: 'Rúbricas',
    desc: 'Plantillas de evaluación por vacante',
    icon: Sparkles,
    to: '/rubricas',
    visibleFor: ['manager', 'selectora'],
    color: 'text-amber-600',
  },
  view_usuarios: {
    title: 'Usuarios',
    desc: 'Gestionar selectoras, managers y clientes',
    icon: Users,
    to: '/usuarios',
    visibleFor: ['manager'],
    color: 'text-blue-600',
  },
  view_facturacion: {
    title: 'Facturación',
    desc: 'Facturas emitidas y pendientes',
    icon: DollarSign,
    to: '/facturacion',
    visibleFor: ['manager'],
    color: 'text-green-600',
  },
  create_vacancy: {
    title: 'Crear vacante',
    desc: 'Nueva búsqueda manual',
    icon: Plus,
    to: '/vacantes?action=create',
    visibleFor: ['manager', 'selectora'],
    color: 'text-violet-600',
  },
  add_candidate_single: {
    title: 'Agregar candidato',
    desc: 'Subí un CV puntual — te llevamos a elegir la vacante',
    icon: UserPlus,
    to: '/vacantes?next=add',
    visibleFor: ['manager', 'selectora'],
    color: 'text-cyan-600',
  },
  add_candidate_bulk: {
    title: 'Carga masiva de CVs',
    desc: 'Subí varios PDFs — te llevamos a elegir la vacante',
    icon: Upload,
    to: '/vacantes?next=bulk',
    visibleFor: ['manager', 'selectora'],
    color: 'text-blue-600',
  },
  score_candidate: {
    title: 'Evaluar con IA',
    desc: 'Correr scoring — te llevamos a elegir la vacante',
    icon: Star,
    to: '/vacantes?next=score',
    visibleFor: ['manager', 'selectora'],
    color: 'text-amber-600',
  },
  send_screening_email: {
    title: 'Enviar screening',
    desc: 'Mandar preguntas a candidatos en etapa screening',
    icon: Send,
    to: '/candidatos?etapa=screening',
    visibleFor: ['manager', 'selectora'],
    color: 'text-indigo-600',
  },
  close_vacancy: {
    title: 'Cerrar vacante',
    desc: 'Finalizá una búsqueda activa desde su detalle',
    icon: XCircle,
    to: '/vacantes?status=Activa',
    visibleFor: ['manager'],
    color: 'text-rose-600',
  },
  reopen_vacancy: {
    title: 'Reabrir vacante',
    desc: 'Volver a abrir una búsqueda cerrada',
    icon: RotateCcw,
    to: '/archivados',
    visibleFor: ['manager'],
    color: 'text-green-600',
  },
  delete_candidate: {
    // Tracked, pero no debería aparecer como tile (destructivo + sin sentido como "acceso rápido").
    title: 'Eliminar candidato',
    desc: '',
    icon: Trash2,
    visibleFor: [],
    color: 'text-rose-600',
  },
  chat_with_assistant: {
    // Tracked, pero el asistente ya está siempre visible en Home — no tiene sentido como tile.
    title: 'Asistente IA',
    desc: '',
    icon: MessageSquare,
    visibleFor: [],
    color: 'text-primary',
  },
  start_jd_wizard: {
    title: 'Armar una nueva búsqueda',
    desc: 'Te ayudamos a definir el puesto con IA — descripción, rúbrica y preguntas',
    icon: Wand2,
    to: '/armar-vacante',
    visibleFor: ['cliente'],
    color: 'text-fuchsia-600',
  },
  review_jd_sessions: {
    title: 'Solicitudes de clientes',
    desc: 'Aprobar nuevas búsquedas armadas por clientes con IA',
    icon: ClipboardList,
    to: '/jd-sessions',
    visibleFor: ['manager', 'selectora'],
    color: 'text-fuchsia-600',
  },
};

/**
 * Acciones que NO deberían aparecer como tile en QuickActions aunque se trackeen.
 * Razones: destructivas (delete), o ya prominentes en la UI (asistente).
 */
export const NEVER_AS_TILE = new Set<ActionType>(['delete_candidate', 'chat_with_assistant']);

/**
 * Orden de defaults por rol (cuando el user no tiene actividad trackeada todavía
 * o cuando hay menos de 4 acciones elegibles).
 */
export const DEFAULT_ACTIONS_BY_ROLE: Record<RoleScope, ActionType[]> = {
  manager: [
    'view_vacancies',
    'create_vacancy',
    'add_candidate_bulk',
    'view_informes',
  ],
  selectora: [
    'view_vacancies',
    'add_candidate_single',
    'add_candidate_bulk',
    'view_rubricas',
  ],
  cliente: [
    'start_jd_wizard',
    'view_vacancies',
  ],
};
