export interface Vacante {
  vacancy_id: string;
  vacancy_name: string;
  status: string;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  created_at: string;
  updated_at: string;
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
  report_file_name: string | null;
  anonymized_file_name: string | null;
  anonymized_file_url: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface ScoreDetalle {
  criterio: string;
  puntaje: number;
  puntaje_max: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'manager' | 'selectora' | 'cliente';
  created_at: string;
  updated_at: string;
}

export interface VacancyAssignment {
  id: number;
  vacancy_id: string;
  user_id: string;
  role: string;
  assigned_at: string;
}

export type UserRole = 'manager' | 'selectora' | 'cliente';

export const ETAPAS = [
  'Nuevo',
  'Contactado',
  'Preguntas screening',
  'Coordinando entrevista selectora',
  'Entrevista agendada',
  'Enviado a cliente',
  'Descartado',
  'Rechazado por cliente',
] as const;

export type Etapa = typeof ETAPAS[number];
