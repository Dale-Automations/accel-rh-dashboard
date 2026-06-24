export interface Vacante {
  vacancy_id: string;
  vacancy_name: string;
  status: string;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  created_at: string;
  updated_at: string;
  close_reason: string | null;
  close_comments: string | null;
  closed_at: string | null;
  close_stats: {
    total_postulantes: number;
    evaluados: number;
    score_promedio: number | null;
    score_maximo: number | null;
    contactados: number;
    fuentes: Record<string, number>;
  } | null;
  job_description: string | null;
  publicar_portal?: boolean | null;
  area?: string | null;
  modalidad?: string | null;
  ubicacion?: string | null;
  tipo_contrato?: string | null;
  reopened_at?: string | null;
  screening_questions?: string[] | null;
  // F2: cascada de evaluacion (solo activa para vacantes de orgs demo)
  gemini_threshold?: number | null;
  auto_cascade_enabled?: boolean | null;
  daily_openai_cap?: number | null;
  organization_id?: string;
}

export interface Postulante {
  id_postulant: string;
  vacancy_id: string;
  vacancy_name: string | null;
  apply_date: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  salary_pretended: number | null;
  status: string | null;
  has_attachments: string | null;
  file_name: string | null;
  scoring_status: string | null;
  notes: string | null;
  contacted: boolean | null;
  interview_date: string | null;
  selectora_id: string | null;
  etapa: string | null;
  contact_status: string | null;
  screening_responses: string | null;
  comments_manager: string | null;
  comments_selectora: string | null;
  signoff_reason: string | null;
  comments_cliente: string | null;
  report_file_name: string | null;
  anonymized_file_name: string | null;
  anonymized_file_url: string | null;
  mostrar_cliente: boolean | null;
  assigned_to_cliente_at: string | null;
  cliente_estado: 'pendiente' | 'aceptado' | 'rechazado' | null;
  cliente_estado_at: string | null;
  prescore_status: 'match' | 'no_match' | 'queued' | 'processing' | 'pending' | 'error' | null;
  prescore_reason: string | null;
  prescore_at: string | null;
  prescore_model: string | null;
  // Flujo de aprobación de informes (selectora → manager → cliente)
  informe_selectora: string | null;             // HTML rich-text
  informe_status: 'pending_review' | 'approved' | 'rejected' | null;
  informe_submitted_at: string | null;
  informe_reviewed_by: string | null;           // user_profiles.id (uuid)
  informe_reviewed_at: string | null;
  informe_rejection_reason: string | null;
  // Quién envió la versión actual del informe (no necesariamente selectora_id, que
  // es la dueña permanente del candidato). Se setea al hacer "Enviar al manager".
  informe_submitted_by: string | null;
  // Si este postulante es copia de otro, apunta al original.
  original_postulant_id: string | null;
  // Screening por email (Preguntas Sugeridas enviadas + respuesta recibida)
  screening_sent_at: string | null;
  screening_received_at: string | null;
  screening_sent_by: string | null;
  // F2: cascada
  eval_pipeline_status?: EvalPipelineStatus | null;
  eval_pipeline_last_error?: string | null;
  eval_pipeline_updated_at?: string | null;
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

export interface RubricaSuggestion {
  id: string;
  rubrica_id: number | null;
  vacancy_id: string;
  vacancy_name: string | null;
  cliente_id: string | null;
  cliente_name: string | null;
  cliente_email: string | null;
  suggestion: string;
  status: 'open' | 'applied' | 'dismissed';
  manager_response: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CvScore {
  id: number;
  postulant_id: string;
  vacancy_id: string;
  file_name: string | null;
  file_id: string | null;
  file_url: string | null;
  score_final: number | null;
  detalles: ScoreDetalle[] | null;
  razones_top3: string[] | null;
  riesgos_top3: string[] | null;
  preguntas_sugeridas: string[] | null;
  respuestas_esperadas: string[] | null;
  match_keywords: string[] | null;
  rubric_used: string | null;
  ai_model: string | null;
  scored_at: string | null;
  score_modified: boolean | null;
  created_at: string | null;
}

export interface ScoreDetalle {
  criterio: string;
  puntaje: number;
  puntaje_max: number;
}

export type UserRoleStrict = 'super_admin' | 'enterprise' | 'manager' | 'selectora' | 'cliente';

export type EvalPipelineStatus =
  | 'idle'
  | 'scoring_openai'
  | 'waiting_gemini'
  | 'scoring_gemini'
  | 'done'
  | 'error_openai'
  | 'error_gemini';

export interface Organization {
  id: string;
  slug: string;
  display_name: string;
  status: 'active' | 'suspended' | 'demo' | 'expired' | 'archived';
  is_demo: boolean;
  demo_expires_at: string | null;
  drive_root_folder_id: string | null;
  default_gemini_threshold: number;
  daily_openai_cap: number;
  created_by: string | null;
  created_at: string;
  has_external_clients?: boolean;
  // demo extras
  demo_source?: string | null;
  demo_created_by?: string | null;
  demo_credit_used?: number;
  demo_credit_cap?: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRoleStrict;
  organization_id: string;
  created_at: string;
  updated_at: string;
  preferences?: {
    action_counts?: Record<string, number>;
    last_action_at?: string;
    onboarding_dismissed?: string[];
  } | null;
  organizations?: Organization | null;
}

export interface VacancyAssignment {
  id: number;
  vacancy_id: string;
  user_id: string;
  role: string;
  assigned_at: string;
}

export interface RubricaCriterio {
  criterio: string;
  descripcion?: string;
  puntaje_max: number;
}

export interface RubricaData {
  criterios: RubricaCriterio[];
  palabras_clave: string[];
}

export interface Rubrica {
  id: number;
  vacancy_id: string;
  version_number: number;
  rubric_json: RubricaCriterio[] | RubricaData;
  suma_total: number;
  is_active: boolean;
  job_description: string | null;
  created_at: string;
  created_by: string | null;
}

/** Helper to normalize rubric_json which can be old format (array) or new format (object) */
export function parseRubricJson(json: RubricaCriterio[] | RubricaData): RubricaData {
  if (Array.isArray(json)) {
    // Old format: migrate by extracting palabras_clave from criteria
    const allKeywords = json.flatMap((c: any) => c.palabras_clave || []);
    return {
      criterios: json.map(c => ({
        criterio: c.criterio,
        descripcion: (c as any).descripcion || '',
        puntaje_max: c.puntaje_max,
      })),
      palabras_clave: [...new Set(allKeywords)],
    };
  }
  return json;
}

export type UserRole = UserRoleStrict;

/**
 * Histórico de iteraciones del informe de un candidato.
 * Cada vez que la selectora "Envía al manager" se crea una fila con version_number creciente.
 * Cuando el manager actúa (aprueba/pide cambios/rechaza) updatea esa fila con decision + feedback.
 * Al volver a enviar (post-cambios) se crea una nueva fila con version_number + 1.
 */
export interface InformeFeedback {
  id: string;
  postulant_id: string;
  vacancy_id: string;
  version_number: number;
  submitted_by: string;
  submitted_by_name: string | null;
  submitted_at: string;
  informe_html_snapshot: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  decision: 'approved' | 'changes_requested' | 'rejected' | null;
  feedback: string | null;
  acknowledged_by_submitter_at: string | null;
  created_at: string;
}

/**
 * Hilo de mensajes manager ↔ cliente sobre un postulante específico.
 * El manager elige por mensaje si publica al cliente o queda interno.
 * Read receipts: cuando alguien abre el detalle, su `read_by_*_at` se actualiza.
 */
export interface PostulantMessage {
  id: string;
  postulant_id: string;
  vacancy_id: string;
  author_id: string;
  author_role: UserRole;
  author_name: string | null;
  visible_to_client: boolean;
  content: string;
  read_by_client_at: string | null;
  read_by_team_at: string | null;
  read_by_team_user_id: string | null;
  read_by_team_user_name: string | null;
  created_at: string;
  deleted_at: string | null;
}

// Sesión del Wizard "Accel GPT" — cliente arma una búsqueda en 4 fases
// con gemma4:26b. Se confirma → email a managers; se aprueba → vacante real.
export type ClientJdSessionStatus =
  | 'active'
  | 'confirmed'
  | 'abandoned'
  | 'approved'
  | 'requires_commercial';

export interface ClientJdHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface ClientJdSession {
  id: string;
  user_id: string;
  status: ClientJdSessionStatus;
  phase: 1 | 2 | 3 | 4;
  exchange_count: number;
  history: ClientJdHistoryEntry[];
  proposed_role_title: string | null;
  proposed_summary: string | null;
  jd_draft: string | null;
  jd_final: string | null;
  rubrica_draft: RubricaData | null;
  rubrica_final: RubricaData | null;
  guion_draft: string[] | null;
  guion_final: string[] | null;
  confirmed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  created_vacancy_id: string | null;
  created_at: string;
  updated_at: string;
}

export const ETAPAS = [
  'Nuevo',
  'Evaluado',
  'Contactado',
  'Preguntas screening',
  'Coordinando entrevista selectora',
  'Entrevista agendada',
  'En revisión por Manager',
  'Enviado a cliente',
  'Aceptado por Cliente',
  'Descartado',
  'Rechazado por cliente',
  'Rechazado por Selector/a',
  'Rechazado por Manager',
] as const;

export type Etapa = typeof ETAPAS[number];
