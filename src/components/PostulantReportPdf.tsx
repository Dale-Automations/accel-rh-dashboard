import { useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/formatters';
import logoSrc from '@/assets/logo.png';
import type { Postulante, CvScore, ScoreDetalle } from '@/types/database';

interface Props {
  postulante: Postulante;
  score: CvScore | null;
  vacancyName?: string;
}

export default function PostulantReportPdf({ postulante, score, vacancyName }: Props) {
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);

  const detalles = (score?.detalles || []) as ScoreDetalle[];

  const generatePdf = useCallback(async () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageW = 215.9;
    const pageH = 279.4;

    const captureEl = async (el: HTMLElement) => {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      return canvas.toDataURL('image/jpeg', 0.95);
    };

    if (page1Ref.current) {
      const img1 = await captureEl(page1Ref.current);
      pdf.addImage(img1, 'JPEG', 0, 0, pageW, pageH);
    }

    if (page2Ref.current && (detalles.length > 0 || score?.preguntas_sugeridas?.length)) {
      pdf.addPage();
      const img2 = await captureEl(page2Ref.current);
      pdf.addImage(img2, 'JPEG', 0, 0, pageW, pageH);
    }

    const safeName = (postulante.full_name || 'Candidato').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '_');
    pdf.save(`Report_${safeName}.pdf`);
  }, [postulante, score, detalles]);

  const scoreVal = score?.score_final;
  const statusText = scoreVal != null
    ? scoreVal >= 80 ? 'Recomendado para entrevista' : scoreVal >= 60 ? 'Para revisión' : 'No recomendado'
    : '—';

  // Build radar chart as SVG manually for PDF rendering
  const radarSvg = buildRadarSvg(detalles);

  return (
    <>
      <Button variant="outline" size="sm" onClick={generatePdf}>
        <Download className="h-4 w-4 mr-2" /> Descargar PDF
      </Button>

      {/* Hidden pages for capture */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        {/* PAGE 1 */}
        <div
          ref={page1Ref}
          style={{
            width: '816px', // letter at 96dpi
            height: '1056px',
            backgroundColor: '#fff',
            fontFamily: 'Helvetica, Arial, sans-serif',
            color: '#1a1a1a',
            padding: '0',
            boxSizing: 'border-box',
            position: 'relative',
            border: '3px solid #2d3561',
          }}
        >
          <div style={{ padding: '40px 50px 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <img src={logoSrc} alt="AccelRH" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
              <span style={{ fontSize: '32px', fontWeight: 300, color: '#333' }}>Candidate Report</span>
            </div>
            <hr style={{ border: 'none', borderTop: '2px solid #2d3561', margin: '0 0 24px' }} />

            {/* Metadata */}
            <table style={{ fontSize: '14px', lineHeight: '1.8', marginBottom: '24px' }}>
              <tbody>
                <MetaRow label="Customer" value={vacancyName || postulante.vacancy_name || '—'} />
                <MetaRow label="Role" value={postulante.vacancy_name || '—'} />
                <MetaRow label="Date" value={formatDate(postulante.apply_date)} />
                <MetaRow label="Candidate Name" value={postulante.full_name || '—'} />
                <MetaRow label="Recruiter" value="ACCELRH" />
              </tbody>
            </table>

            {/* Score */}
            <p style={{ fontSize: '16px', marginBottom: '4px' }}>
              <strong>AcceleRATE Match Score:</strong> {scoreVal != null ? `${scoreVal}/100` : '—'}
            </p>
            <p style={{ fontSize: '14px', marginBottom: '28px' }}>
              <strong>Status:</strong> {statusText}
            </p>

            {/* Profile Summary */}
            {score?.razones_top3 && score.razones_top3.length > 0 && (
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Professional Profile Summary</h3>
                <p style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '28px', color: '#333' }}>
                  {postulante.screening_responses || postulante.comments_selectora || postulante.comments_manager || 'Sin resumen disponible.'}
                </p>
              </>
            )}

            {/* Key Strengths */}
            {score?.razones_top3 && score.razones_top3.length > 0 && (
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Key Strengths (Value for the Client)</h3>
                {score.razones_top3.map((r, i) => (
                  <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '12px', color: '#333' }}>
                    {r}
                  </p>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <PageFooter />
        </div>

        {/* PAGE 2 */}
        {(detalles.length > 0 || score?.preguntas_sugeridas?.length) && (
          <div
            ref={page2Ref}
            style={{
              width: '816px',
              height: '1056px',
              backgroundColor: '#fff',
              fontFamily: 'Helvetica, Arial, sans-serif',
              color: '#1a1a1a',
              padding: '0',
              boxSizing: 'border-box',
              position: 'relative',
              border: '3px solid #2d3561',
            }}
          >
            <div style={{ padding: '40px 50px 20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <img src={logoSrc} alt="AccelRH" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
                <span style={{ fontSize: '32px', fontWeight: 300, color: '#333' }}>Candidate Report</span>
              </div>

              {/* Scoring Breakdown */}
              {detalles.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Scoring Breakdown</h3>
                  <div
                    style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}
                    dangerouslySetInnerHTML={{ __html: radarSvg }}
                  />
                </>
              )}

              {/* Logistics */}
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Logistics &amp; Salary Expectations</h3>
              <div style={{ fontSize: '13px', lineHeight: '1.7', marginBottom: '24px', color: '#333' }}>
                <p>Salary Expectation: {postulante.salary_pretended ? formatCurrency(postulante.salary_pretended) : '—'}</p>
                <p>Availability: {postulante.contact_status || '—'}</p>
                <p>Stage: {postulante.etapa || '—'}</p>
              </div>

              {/* Interviewer Notes */}
              {score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>
                    Interviewer Notes (Suggested points to validate)
                  </h3>
                  {score.preguntas_sugeridas.map((q, i) => (
                    <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '10px', color: '#333' }}>
                      {q}
                    </p>
                  ))}
                </>
              )}

              {/* Risks */}
              {score?.riesgos_top3 && score.riesgos_top3.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px', marginTop: '20px' }}>Risks to Consider</h3>
                  {score.riesgos_top3.map((r, i) => (
                    <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '8px', color: '#333' }}>
                      ⚠ {r}
                    </p>
                  ))}
                </>
              )}

              <p style={{ fontSize: '13px', marginTop: '24px' }}>Sincerely,</p>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#5b4fb5', marginTop: '4px' }}>AccelRH Recruitment Team</h4>
            </div>

            <PageFooter />
          </div>
        )}
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ paddingRight: '40px', color: '#666' }}>{label}</td>
      <td style={{ fontWeight: 500 }}>{value}</td>
    </tr>
  );
}

function PageFooter() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        padding: '16px 50px 20px',
        textAlign: 'center',
        fontSize: '10px',
        color: '#666',
        lineHeight: '1.5',
      }}
    >
      <p style={{ marginBottom: '6px' }}>
        <strong>Confidentiality Notice:</strong> The information contained in this report is confidential and intended exclusively for processes
        managed by AccelRH. Any direct contact with the candidate without prior coordination with our team will be considered a
        deviation from the established procedure. We kindly ask you to maintain confidentiality and respect the formal communication channels.
      </p>
      <p>1+54 9 11 5581-3098 | seleccion.2@accel-rh.com | www.accel-rh.com</p>
    </div>
  );
}

function buildRadarSvg(detalles: ScoreDetalle[]): string {
  if (detalles.length === 0) return '';

  const cx = 250, cy = 220, r = 160;
  const n = detalles.length;
  const maxVal = Math.max(...detalles.map(d => d.puntaje_max), 1);
  const levels = 5;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const ratio = value / maxVal;
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    };
  };

  // Grid lines
  let gridLines = '';
  for (let l = 1; l <= levels; l++) {
    const pts = Array.from({ length: n }, (_, i) => {
      const p = getPoint(i, (maxVal * l) / levels);
      return `${p.x},${p.y}`;
    }).join(' ');
    gridLines += `<polygon points="${pts}" fill="none" stroke="#ddd" stroke-width="1"/>`;
  }

  // Axis lines
  let axes = '';
  for (let i = 0; i < n; i++) {
    const p = getPoint(i, maxVal);
    axes += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#ddd" stroke-width="1"/>`;
  }

  // Max polygon
  const maxPts = detalles.map((d, i) => {
    const p = getPoint(i, d.puntaje_max);
    return `${p.x},${p.y}`;
  }).join(' ');

  // Value polygon
  const valPts = detalles.map((d, i) => {
    const p = getPoint(i, d.puntaje);
    return `${p.x},${p.y}`;
  }).join(' ');

  // Labels
  let labels = '';
  detalles.forEach((d, i) => {
    const p = getPoint(i, maxVal * 1.18);
    const anchor = p.x < cx - 10 ? 'end' : p.x > cx + 10 ? 'start' : 'middle';
    // Word wrap long labels
    const words = d.criterio.split(' ');
    const lines: string[] = [];
    let current = '';
    words.forEach(w => {
      if ((current + ' ' + w).trim().length > 18) {
        lines.push(current.trim());
        current = w;
      } else {
        current = (current + ' ' + w).trim();
      }
    });
    if (current) lines.push(current);

    lines.forEach((line, li) => {
      labels += `<text x="${p.x}" y="${p.y + li * 14}" text-anchor="${anchor}" font-size="11" fill="#555">${line}</text>`;
    });
  });

  // Percentage labels on axis
  let pctLabels = '';
  for (let l = 1; l <= levels; l++) {
    const val = Math.round((maxVal * l) / levels);
    const pct = Math.round((l / levels) * 100);
    const p = getPoint(0, (maxVal * l) / levels);
    pctLabels += `<text x="${p.x + 4}" y="${p.y - 4}" font-size="9" fill="#999">${pct}%</text>`;
  }

  return `<svg width="500" height="440" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${axes}
    <polygon points="${maxPts}" fill="rgba(200,200,220,0.2)" stroke="rgba(150,150,180,0.5)" stroke-width="1.5"/>
    <polygon points="${valPts}" fill="rgba(91,79,181,0.3)" stroke="rgba(91,79,181,0.8)" stroke-width="2"/>
    ${labels}
    ${pctLabels}
  </svg>`;
}
