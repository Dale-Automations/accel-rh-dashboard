import type { UserRoleStrict } from '@/types/database';

export interface FaqEntry {
  q: string;
  a: string;
  cta?: { label: string; to?: string };
  visibleFor?: UserRoleStrict[];
}

export const FAQ: FaqEntry[] = [
  // Vacantes y wizard
  {
    q: '¿Cómo armo una vacante con el asistente IA?',
    a: 'Desde el dashboard, abrí la tarjeta violeta "Armá tu próxima vacante con IA" o la tarjeta 1 del onboarding. Te abre un chat: contale en lenguaje natural qué puesto buscás. El asistente te hace preguntas y al final genera la Job Description, la rúbrica de evaluación y un guion de entrevista. Selectora arma el material; manager/enterprise aprueba para abrir la búsqueda.',
    cta: { label: 'Abrir asistente', to: '/armar-vacante' },
    visibleFor: ['enterprise', 'manager', 'selectora', 'cliente'],
  },
  {
    q: '¿Cómo veo el listado completo de vacantes?',
    a: 'Desde el sidebar izquierdo, click en "Vacantes". Vas a ver la tabla completa con filtros, búsqueda y estado de cada vacante.',
    cta: { label: 'Ir a Vacantes', to: '/vacantes' },
  },
  {
    q: '¿Cómo cierro una vacante?',
    a: 'Entrá a la vacante. Arriba a la derecha hay un botón rojo "Cerrar Vacante" (solo manager/enterprise). Tenés que elegir un motivo y confirmar. La vacante queda archivada pero podés reabrirla.',
    visibleFor: ['enterprise', 'manager'],
  },
  {
    q: '¿Cómo reabro una vacante cerrada?',
    a: 'Entrá a la vacante cerrada. Arriba a la derecha hay un botón verde "Reabrir Vacante" (solo manager/enterprise). Esto restaura los candidatos archivados de esa vacante.',
    visibleFor: ['enterprise', 'manager'],
  },

  // Candidatos
  {
    q: '¿Cómo agrego un candidato manualmente?',
    a: 'Entrá a la vacante, scrolleá hasta la tabla de candidatos y arriba a la derecha vas a ver un botón "+ Agregar". Tenés dos opciones: "Uno por uno" (form con CV) o "Carga masiva" (varios PDFs a la vez).',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },
  {
    q: '¿Cómo hago carga masiva de CVs?',
    a: 'Entrá a una vacante, click en "+ Agregar" y elegí "Carga masiva (varios CVs)". Arrastrá todos los PDFs al cuadro y click "Subir". El sistema extrae nombre, email y teléfono de cada CV con IA y los carga automáticamente a la vacante.',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },
  {
    q: '¿Cómo veo el CV de un candidato?',
    a: 'En la lista de candidatos, click en el nombre. En el perfil vas a ver el botón "Ver CV" o "Ver CV Anonimizado" (cliente) o "Ver perfil de LinkedIn" según el origen del candidato.',
  },
  {
    q: '¿Cómo cargo candidatos desde LinkedIn (headhunting)?',
    a: 'Entrá a una vacante y desde la cabecera click "Solicitar headhunting". Pedí cuántos perfiles querés (hasta 10). El manager aprueba la solicitud y el sistema busca en LinkedIn y carga los perfiles a la vacante automáticamente.',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },
  {
    q: '¿Qué hago si el portal de Accel también me trae candidatos?',
    a: 'Si publicaste la vacante en el portal público y compartiste el link en tus redes, los postulantes entran automáticamente a tu vacante en el sistema. Aparecen con la misma tabla que los manuales y se evalúan igual con el botón "Evaluar candidatos".',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },

  // Rúbrica y evaluación
  {
    q: '¿Qué es la rúbrica y para qué sirve?',
    a: 'La rúbrica es el conjunto de criterios con sus pesos que la IA usa para puntuar a cada candidato. Por ejemplo: 30% experiencia técnica, 20% idiomas, 15% ubicación, etc. La armás vos (o la genera el asistente IA al inicio) y podés editarla cuando quieras. Sin rúbrica activa no se puede evaluar.',
    cta: { label: 'Ir a Rúbricas', to: '/rubricas' },
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },
  {
    q: '¿Cómo evalúo a los candidatos con IA?',
    a: 'En la vacante, click el botón "Evaluar candidatos". El sistema hace 3 cosas en cadena: 1) Pre-filtro local que descarta CVs vacíos o sin relación; 2) OpenAI puntúa como un selector junior contra la rúbrica; 3) Gemini hace una segunda opinión "senior" sobre los que pasan el umbral (default 80 puntos). Mientras corre vas a ver badges en la tabla.',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },
  {
    q: '¿Qué significa "No se pudo leer" en la evaluación?',
    a: 'La IA no pudo extraer texto del CV (escaneado, imagen, o tipo no soportado). No es un rechazo: el candidato necesita revisión manual. Podés pedirle el CV en otro formato o leerlo vos.',
  },
  {
    q: '¿Cómo apruebo o rechazo un candidato?',
    a: 'Entrá al perfil del candidato. En la sección "Pipeline" tenés botones para mover el candidato de etapa (preseleccionado, entrevista, aceptado, rechazado). También podés agregar comentarios privados o visibles al cliente.',
    visibleFor: ['enterprise', 'manager', 'selectora', 'cliente'],
  },
  {
    q: '¿Cómo envío las preguntas de screening por email?',
    a: 'Entrá al perfil del candidato. En "Preguntas Sugeridas" editá si querés, después click en "Enviar por email". El candidato responde por email y la respuesta aparece en su perfil automáticamente.',
    visibleFor: ['enterprise', 'manager', 'selectora'],
  },

  // Soporte
  {
    q: '¿Cómo me contacto con soporte si algo no funciona?',
    a: 'Andá a "Soporte" en el menú izquierdo y abrí un ticket. Elegí la categoría ("error", "no entiendo cómo", "sugerencia") y describí el problema. El equipo de soporte te responde desde el sistema y el thread queda guardado en tu cuenta.',
    cta: { label: 'Abrir Soporte', to: '/soporte' },
  },
  {
    q: '¿Las dudas de uso son tickets?',
    a: 'No siempre. Para dudas de cómo usar algo, antes de abrir ticket revisá las "Preguntas frecuentes" y los tutoriales en /soporte: la mayoría de las dudas están ahí. Si igual no encontrás lo que buscás, abrí ticket.',
    cta: { label: 'Ver Soporte', to: '/soporte' },
  },
];

export function filterFaqByRole(faq: FaqEntry[], role: string | null | undefined): FaqEntry[] {
  if (!role) return faq.filter(f => !f.visibleFor);
  return faq.filter(f => !f.visibleFor || f.visibleFor.includes(role as UserRoleStrict));
}

export function searchFaq(faq: FaqEntry[], query: string): FaqEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return faq;
  return faq.filter(f =>
    f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
  );
}
