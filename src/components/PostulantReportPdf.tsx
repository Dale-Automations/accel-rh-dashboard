import { useRef, useCallback, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/formatters';
import logoSrc from '@/assets/logo.png';
import type { Postulante, CvScore, ScoreDetalle } from '@/types/database';

interface Props {
  postulante: Postulante;
  score: CvScore | null;
  vacancyName?: string;
}

// A4 at 96dpi
const A4_W_PX = 794;
const A4_H_PX = 1123;
const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN = 56;
const FOOTER_H = 72;

export default function PostulantReportPdf({ postulante, score, vacancyName }: Props) {
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const detalles = (score?.detalles || []) as ScoreDetalle[];
  const hasPage2 = detalles.length > 0 || (score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0);

  const generatePdf = useCallback(async () => {
    setGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const captureEl = async (el: HTMLElement) => {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: A4_W_PX,
          height: A4_H_PX,
          windowWidth: A4_W_PX,
        });
        return canvas.toDataURL('image/jpeg', 0.92);
      };

      if (page1Ref.current) {
        const img = await captureEl(page1Ref.current);
        pdf.addImage(img, 'JPEG', 0, 0, A4_W_MM, A4_H_MM);
      }

      if (page2Ref.current && hasPage2) {
        pdf.addPage();
        const img = await captureEl(page2Ref.current);
        pdf.addImage(img, 'JPEG', 0, 0, A4_W_MM, A4_H_MM);
      }

      const safeName = (postulante.full_name || 'Candidato').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '_');
      pdf.save(`Report_${safeName}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, [postulante, score, detalles, hasPage2]);

  const scoreVal = score?.score_final;
  const statusText = scoreVal != null
    ? scoreVal >= 80 ? 'Recommended for Interview' : scoreVal >= 60 ? 'Under Review' : 'Not Recommended'
    : '—';

  const radarSvg = buildRadarSvg(detalles);

  const pageStyle: React.CSSProperties = {
    width: `${A4_W_PX}px`,
    height: `${A4_H_PX}px`,
    backgroundColor: '#fff',
    fontFamily: 'Helvetica, Arial, sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
    border: '3px solid #2d3561',
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={generatePdf} disabled={generating}>
        {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {generating ? 'Generando...' : 'Descargar PDF'}
      </Button>

      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        {/* ===== PAGE 1 ===== */}
        <div ref={page1Ref} style={pageStyle}>
          <div style={{ padding: `${MARGIN}px ${MARGIN}px 0` }}>
            <PageHeader />
            <hr style={{ border: 'none', borderTop: '2px solid #2d3561', margin: '0 0 24px' }} />

            {/* Metadata table */}
            <table style={{ fontSize: '13px', lineHeight: '2', marginBottom: '24px' }}>
              <tbody>
                <MetaRow label="Customer" value={vacancyName || postulante.vacancy_name || '—'} />
                <MetaRow label="Role" value={postulante.vacancy_name || '—'} />
                <MetaRow label="Date" value={formatDate(postulante.apply_date)} />
                <MetaRow label="Candidate Name" value={postulante.full_name || '—'} />
                <MetaRow label="Recruiter" value="ACCELRH" />
              </tbody>
            </table>

            {/* Score + Status */}
            <p style={{ fontSize: '15px', marginBottom: '2px' }}>
              <strong>AcceleRATE Match Score:</strong> {scoreVal != null ? `${scoreVal}/100` : '—'}
            </p>
            <p style={{ fontSize: '13px', marginBottom: '28px' }}>
              <strong>Status:</strong> {statusText}
            </p>

            {/* Profile Summary */}
            {(postulante.screening_responses || postulante.comments_selectora || postulante.comments_manager) && (
              <>
                <SectionTitle>Professional Profile Summary</SectionTitle>
                <p style={{ fontSize: '12px', lineHeight: '1.7', marginBottom: '24px', color: '#333' }}>
                  {postulante.screening_responses || postulante.comments_selectora || postulante.comments_manager}
                </p>
              </>
            )}

            {/* Key Strengths */}
            {score?.razones_top3 && score.razones_top3.length > 0 && (
              <>
                <SectionTitle>Key Strengths (Value for the Client)</SectionTitle>
                {score.razones_top3.map((r, i) => (
                  <p key={i} style={{ fontSize: '12px', lineHeight: '1.7', marginBottom: '12px', color: '#333' }}>
                    {r}
                  </p>
                ))}
              </>
            )}
          </div>
          <PageFooter />
        </div>

        {/* ===== PAGE 2 ===== */}
        {hasPage2 && (
          <div ref={page2Ref} style={pageStyle}>
            <div style={{ padding: `${MARGIN}px ${MARGIN}px 0` }}>
              <PageHeader />

              {/* Scoring Breakdown */}
              {detalles.length > 0 && (
                <>
                  <SectionTitle>Scoring Breakdown</SectionTitle>
                  <div
                    style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}
                    dangerouslySetInnerHTML={{ __html: radarSvg }}
                  />
                </>
              )}

              {/* Logistics */}
              <SectionTitle>Logistics &amp; Salary Expectations</SectionTitle>
              <div style={{ fontSize: '12px', lineHeight: '1.7', marginBottom: '20px', color: '#333' }}>
                <p>Salary Expectation: {postulante.salary_pretended ? formatCurrency(postulante.salary_pretended) : '—'}</p>
                <p>Availability: {postulante.contact_status || '—'}</p>
                <p>Stage: {postulante.etapa || '—'}</p>
              </div>

              {/* Interviewer Notes */}
              {score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0 && (
                <>
                  <SectionTitle>Interviewer Notes (Suggested points to validate in your internal interview)</SectionTitle>
                  {score.preguntas_sugeridas.map((q, i) => (
                    <p key={i} style={{ fontSize: '12px', lineHeight: '1.7', marginBottom: '8px', color: '#333' }}>
                      {q}
                    </p>
                  ))}
                </>
              )}

              {/* Risks */}
              {score?.riesgos_top3 && score.riesgos_top3.length > 0 && (
                <>
                  <SectionTitle style={{ marginTop: '16px' }}>Risks to Consider</SectionTitle>
                  {score.riesgos_top3.map((r, i) => (
                    <p key={i} style={{ fontSize: '12px', lineHeight: '1.7', marginBottom: '6px', color: '#333' }}>
                      ⚠ {r}
                    </p>
                  ))}
                </>
              )}

              {/* Signature */}
              <div style={{ marginTop: '20px' }}>
                <p style={{ fontSize: '12px' }}>Sincerely,</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#5b4fb5', marginTop: '4px' }}>AccelRH Recruitment Team</p>
              </div>
            </div>
            <PageFooter />
          </div>
        )}
      </div>
    </>
  );
}

function PageHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
      <img src={logoSrc} alt="AccelRH" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
      <span style={{ fontSize: '28px', fontWeight: 300, color: '#333', letterSpacing: '0.5px' }}>Candidate Report</span>
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px', marginTop: '0', ...style }}>
      {children}
    </h3>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ paddingRight: '40px', color: '#666', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
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
        height: `${FOOTER_H}px`,
        padding: `10px ${MARGIN}px 14px`,
        textAlign: 'center',
        fontSize: '8.5px',
        color: '#666',
        lineHeight: '1.5',
        borderTop: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <p style={{ marginBottom: '4px' }}>
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

  const svgW = 580;
  const svgH = 400;
  const cx = svgW / 2, cy = svgH / 2, r = 130;
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

  let gridLines = '';
  for (let l = 1; l <= levels; l++) {
    const pts = Array.from({ length: n }, (_, i) => {
      const p = getPoint(i, (maxVal * l) / levels);
      return `${p.x},${p.y}`;
    }).join(' ');
    gridLines += `<polygon points="${pts}" fill="none" stroke="#ddd" stroke-width="0.8"/>`;
  }

  let axes = '';
  for (let i = 0; i < n; i++) {
    const p = getPoint(i, maxVal);
    axes += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#ddd" stroke-width="0.8"/>`;
  }

  const maxPts = detalles.map((d, i) => {
    const p = getPoint(i, d.puntaje_max);
    return `${p.x},${p.y}`;
  }).join(' ');

  const valPts = detalles.map((d, i) => {
    const p = getPoint(i, d.puntaje);
    return `${p.x},${p.y}`;
  }).join(' ');

  let labels = '';
  detalles.forEach((d, i) => {
    const p = getPoint(i, maxVal * 1.2);
    const anchor = p.x < cx - 10 ? 'end' : p.x > cx + 10 ? 'start' : 'middle';
    const words = d.criterio.split(' ');
    const lines: string[] = [];
    let current = '';
    words.forEach(w => {
      if ((current + ' ' + w).trim().length > 16) {
        lines.push(current.trim());
        current = w;
      } else {
        current = (current + ' ' + w).trim();
      }
    });
    if (current) lines.push(current);

    lines.forEach((line, li) => {
      labels += `<text x="${p.x}" y="${p.y + li * 13}" text-anchor="${anchor}" font-size="10" font-family="Helvetica, Arial, sans-serif" fill="#444">${line}</text>`;
    });
  });

  let pctLabels = '';
  for (let l = 1; l <= levels; l++) {
    const pct = Math.round((l / levels) * 100);
    const p = getPoint(0, (maxVal * l) / levels);
    pctLabels += `<text x="${p.x + 4}" y="${p.y - 3}" font-size="8" fill="#999">${pct}%</text>`;
  }

  return `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${axes}
    <polygon points="${maxPts}" fill="rgba(200,200,220,0.2)" stroke="rgba(150,150,180,0.5)" stroke-width="1"/>
    <polygon points="${valPts}" fill="rgba(91,79,181,0.25)" stroke="rgba(91,79,181,0.8)" stroke-width="1.5"/>
    ${labels}
    ${pctLabels}
  </svg>`;
}
