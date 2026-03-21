import { useState, useCallback, RefObject } from 'react';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/formatters';
import logoSrc from '@/assets/logo.png';
import html2canvas from 'html2canvas';
import type { Postulante, CvScore, ScoreDetalle } from '@/types/database';

interface Props {
  postulante: Postulante;
  score: CvScore | null;
  vacancyName?: string;
  radarChartRef?: RefObject<HTMLDivElement | null>;
}

// A4 in points (72 dpi)
const PW = 595.28;
const PH = 841.89;
const ML = 56; // left margin
const MR = 56; // right margin
const MT = 56; // top margin
const MB = 80; // bottom margin (footer space)
const CW = PW - ML - MR; // content width

const BORDER_COLOR = rgb(0.176, 0.208, 0.38); // #2d3561
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.6, 0.6, 0.6);
const ACCENT = rgb(0.357, 0.31, 0.71); // #5b4fb5
type Lang = 'es' | 'en';

const t = {
  es: {
    candidateReport: 'Reporte de Candidato',
    customer: 'Cliente',
    role: 'Puesto',
    date: 'Fecha',
    candidateName: 'Nombre del Candidato',
    recruiter: 'Reclutador',
    matchScore: 'Puntaje de Compatibilidad AcceleRATE',
    status: 'Estado',
    recommended: 'Recomendado para Entrevista',
    underReview: 'En Revision',
    notRecommended: 'No Recomendado',
    profileSummary: 'Resumen del Perfil Profesional',
    keyStrengths: 'Fortalezas Clave (Valor para el Cliente)',
    logistics: 'Logistica y Expectativas Salariales',
    salaryExpectation: 'Expectativa Salarial',
    availability: 'Disponibilidad',
    stage: 'Etapa',
    scoringBreakdown: 'Desglose de Evaluacion',
    interviewerNotes: 'Notas para el Entrevistador (Puntos sugeridos para validar en su entrevista interna)',
    risks: 'Riesgos a Considerar',
    sincerely: 'Atentamente,',
    confidential: 'CONFIDENCIAL - Solo para uso interno del cliente',
    contact: 'AccelRH | contacto@accelrh.com',
    fileName: 'Reporte',
  },
  en: {
    candidateReport: 'Candidate Report',
    customer: 'Customer',
    role: 'Role',
    date: 'Date',
    candidateName: 'Candidate Name',
    recruiter: 'Recruiter',
    matchScore: 'AcceleRATE Match Score',
    status: 'Status',
    recommended: 'Recommended for Interview',
    underReview: 'Under Review',
    notRecommended: 'Not Recommended',
    profileSummary: 'Professional Profile Summary',
    keyStrengths: 'Key Strengths (Value for the Client)',
    logistics: 'Logistics & Salary Expectations',
    salaryExpectation: 'Salary Expectation',
    availability: 'Availability',
    stage: 'Stage',
    scoringBreakdown: 'Scoring Breakdown',
    interviewerNotes: 'Interviewer Notes (Suggested points to validate in your internal interview)',
    risks: 'Risks to Consider',
    sincerely: 'Sincerely,',
    confidential: 'CONFIDENTIAL - For client internal use only',
    contact: 'AccelRH | contacto@accelrh.com',
    fileName: 'Report',
  },
};

export default function PostulantReportPdf({ postulante, score, vacancyName, radarChartRef }: Props) {
  const [generating, setGenerating] = useState(false);

  const detalles = (score?.detalles || []) as ScoreDetalle[];

  const captureEvaluationSection = useCallback(async (): Promise<Uint8Array | null> => {
    if (!radarChartRef?.current) return null;
    try {
      const canvas = await html2canvas(radarChartRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          } else {
            resolve(null);
          }
        }, 'image/png');
      });
    } catch {
      return null;
    }
  }, [radarChartRef]);

  const generatePdf = useCallback(async (lang: Lang = 'es') => {
    const l = t[lang];
    try {
      const pdfDoc = await PDFDocument.create();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

      // Load logo
      let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
      try {
        const logoRes = await fetch(logoSrc);
        const logoBytes = await logoRes.arrayBuffer();
        logoImage = await pdfDoc.embedPng(new Uint8Array(logoBytes));
      } catch {
        // Logo not available, continue without
      }

      const scoreVal = score?.score_final;
      const statusText = scoreVal != null
        ? scoreVal >= 80 ? l.recommended : scoreVal >= 60 ? l.underReview : l.notRecommended
        : '—';

      // Helper context
      const ctx = {
        pdfDoc,
        helvetica,
        helveticaBold,
        helveticaOblique,
        logoImage,
      };

      // ===== PAGE 1 =====
      let page = pdfDoc.addPage([PW, PH]);
      drawBorder(page);
      let y = PH - MT;

      // Header
      y = drawHeader(page, ctx, y);

      // Divider line
      page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 1.5, color: BORDER_COLOR });
      y -= 32;

      // Metadata with better spacing
      const metaFields = [
        [l.customer, vacancyName || postulante.vacancy_name || '—'],
        [l.role, postulante.vacancy_name || '—'],
        [l.date, formatDate(postulante.apply_date)],
        [l.candidateName, postulante.full_name || '—'],
        [l.recruiter, 'ACCELRH'],
      ];
      for (const [label, value] of metaFields) {
        page.drawText(label, { x: ML, y, size: 11, font: helvetica, color: GRAY });
        page.drawText(value, { x: ML + 140, y, size: 11, font: helveticaBold, color: TEXT_COLOR });
        y -= 24;
      }
      y -= 16;

      // Score - bigger and more prominent
      page.drawText(`${l.matchScore}: ${scoreVal != null ? `${scoreVal}/100` : '—'}`, {
        x: ML, y, size: 15, font: helveticaBold, color: ACCENT,
      });
      y -= 22;
      page.drawText(`${l.status}: ${statusText}`, {
        x: ML, y, size: 12, font: helveticaBold, color: TEXT_COLOR,
      });
      y -= 36;

      // Profile Summary
      const summaryText = postulante.screening_responses || postulante.comments_selectora || postulante.comments_manager;
      if (summaryText) {
        y = drawSectionTitle(page, helveticaBold, l.profileSummary, y);
        y = drawWrappedText(page, helvetica, summaryText, y, 11, TEXT_COLOR);
        y -= 24;
      }

      // Key Strengths
      if (score?.razones_top3 && score.razones_top3.length > 0) {
        y = drawSectionTitle(page, helveticaBold, l.keyStrengths, y);
        for (const r of score.razones_top3) {
          y = drawWrappedText(page, helvetica, `- ${r}`, y, 11, TEXT_COLOR);
          y -= 14;
        }
      }

      // Logistics on page 1 since we have space
      y -= 8;
      y = drawSectionTitle(page, helveticaBold, l.logistics, y);
      y = drawWrappedText(page, helvetica, `${l.salaryExpectation}: ${postulante.salary_pretended ? formatCurrency(postulante.salary_pretended) : '—'}`, y, 11, TEXT_COLOR);
      y -= 4;
      y = drawWrappedText(page, helvetica, `${l.availability}: ${postulante.contact_status || '—'}`, y, 11, TEXT_COLOR);
      y -= 4;
      y = drawWrappedText(page, helvetica, `${l.stage}: ${postulante.etapa || '—'}`, y, 11, TEXT_COLOR);

      drawFooter(page, helvetica, helveticaBold);

      // ===== PAGE 2: Evaluation Screenshot =====
      const evalImage = await captureEvaluationSection();
      if (evalImage) {
        page = pdfDoc.addPage([PW, PH]);
        drawBorder(page);
        y = PH - MT;
        y = drawHeader(page, ctx, y);

        y = drawSectionTitle(page, helveticaBold, l.scoringBreakdown, y);
        y -= 6;

        const pngImg = await pdfDoc.embedPng(evalImage);
        const imgDims = pngImg.scale(1);
        const availW = CW;
        const availH = y - MB - 20;
        const scale = Math.min(availW / imgDims.width, availH / imgDims.height, 1);
        const drawW = imgDims.width * scale;
        const drawH = imgDims.height * scale;
        const imgX = ML + (CW - drawW) / 2;

        page.drawImage(pngImg, { x: imgX, y: y - drawH, width: drawW, height: drawH });

        drawFooter(page, helvetica, helveticaBold);
      } else if (detalles.length > 0) {
        // Fallback to programmatic charts
        page = pdfDoc.addPage([PW, PH]);
        drawBorder(page);
        y = PH - MT;
        y = drawHeader(page, ctx, y);
        y = drawSectionTitle(page, helveticaBold, l.scoringBreakdown, y);
        y -= 6;
        y = drawRadarChart(page, detalles, helvetica, y);
        y -= 22;
        y = drawBarChart(page, detalles, helvetica, helveticaBold, y);

        drawFooter(page, helvetica, helveticaBold);
      }

      // ===== PAGE 3: Notes, Risks, Signature =====
      const hasPage3 = (score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0) ||
                        (score?.riesgos_top3 && score.riesgos_top3.length > 0);
      if (hasPage3) {
        page = pdfDoc.addPage([PW, PH]);
        drawBorder(page);
        y = PH - MT;
        y = drawHeader(page, ctx, y);

        // Interviewer Notes
        if (score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0) {
          y = drawSectionTitle(page, helveticaBold, l.interviewerNotes, y);
          for (const q of score.preguntas_sugeridas) {
            if (y < MB + 60) {
              drawFooter(page, helvetica, helveticaBold);
              page = pdfDoc.addPage([PW, PH]);
              drawBorder(page);
              y = PH - MT;
              y = drawHeader(page, ctx, y);
            }
            y = drawWrappedText(page, helvetica, `- ${q}`, y, 10.5, TEXT_COLOR);
            y -= 10;
          }
          y -= 6;
        }

        // Risks
        if (score?.riesgos_top3 && score.riesgos_top3.length > 0) {
          if (y < MB + 60) {
            drawFooter(page, helvetica, helveticaBold);
            page = pdfDoc.addPage([PW, PH]);
            drawBorder(page);
            y = PH - MT;
            y = drawHeader(page, ctx, y);
          }
          y = drawSectionTitle(page, helveticaBold, l.risks, y);
          for (const r of score.riesgos_top3) {
            if (y < MB + 60) {
              drawFooter(page, helvetica, helveticaBold);
              page = pdfDoc.addPage([PW, PH]);
              drawBorder(page);
              y = PH - MT;
              y = drawHeader(page, ctx, y);
            }
            y = drawWrappedText(page, helvetica, `[!] ${r}`, y, 10.5, TEXT_COLOR);
            y -= 8;
          }
        }

        // Signature
        y -= 24;
        page.drawText(l.sincerely, { x: ML, y, size: 10.5, font: helvetica, color: TEXT_COLOR });
        y -= 16;
        page.drawText('AccelRH Recruitment Team', { x: ML, y, size: 12, font: helveticaBold, color: ACCENT });

        drawFooter(page, helvetica, helveticaBold);
      }

      // Save
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (postulante.full_name || 'Candidato').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '_');
      link.download = `Report_${safeName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }, [postulante, score, detalles, vacancyName, captureEvaluationSection]);

  return (
    <Button variant="outline" size="sm" onClick={generatePdf} disabled={generating}>
      {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
      {generating ? 'Generando...' : 'Descargar PDF'}
    </Button>
  );
}

// ===== Drawing helpers =====

function drawBorder(page: PDFPage) {
  const inset = 8;
  page.drawRectangle({
    x: inset, y: inset, width: PW - inset * 2, height: PH - inset * 2,
    borderColor: BORDER_COLOR, borderWidth: 2, color: undefined,
  });
}

function drawHeader(
  page: PDFPage,
  ctx: { logoImage: any; helvetica: PDFFont; helveticaBold: PDFFont },
  y: number,
): number {
  const logoSize = 44;
  if (ctx.logoImage) {
    page.drawImage(ctx.logoImage, { x: ML, y: y - logoSize, width: logoSize, height: logoSize });
  }
  page.drawText('Candidate Report', {
    x: ML + logoSize + 14, y: y - 32, size: 24, font: ctx.helvetica, color: rgb(0.2, 0.2, 0.2),
  });
  return y - logoSize - 14;
}

function drawSectionTitle(page: PDFPage, font: PDFFont, title: string, y: number): number {
  // Wrap long titles
  const maxW = CW;
  const size = 13;
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  for (const line of lines) {
    page.drawText(line, { x: ML, y, size, font, color: TEXT_COLOR });
    y -= 17;
  }
  y -= 4;
  return y;
}

function drawWrappedText(
  page: PDFPage, font: PDFFont, text: string, y: number,
  size: number, color: ReturnType<typeof rgb>,
): number {
  const lines = wrapText(font, text, size, CW);
  for (const line of lines) {
    page.drawText(line, { x: ML, y, size, font, color });
    y -= size + 4;
  }
  return y;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const result: string[] = [];
  const words = text.split(' ');
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    try {
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (current) result.push(current);
        current = word;
      } else {
        current = test;
      }
    } catch {
      // Character not in font, skip measurement
      current = test;
    }
  }
  if (current) result.push(current);
  return result.length > 0 ? result : [''];
}

function estimateTextHeight(texts: string[], font: PDFFont, size: number): number {
  let total = 0;
  for (const t of texts) {
    const lines = wrapText(font, t, size, CW);
    total += lines.length * (size + 4) + 10;
  }
  return total;
}

function drawFooter(page: PDFPage, font: PDFFont, fontBold: PDFFont) {
  const footerY = 44;
  // Separator line
  page.drawLine({ start: { x: ML, y: footerY + 22 }, end: { x: PW - MR, y: footerY + 22 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

  const notice = 'Confidentiality Notice: The information contained in this report is confidential and intended exclusively for processes managed by AccelRH. Any direct contact with the candidate without prior coordination with our team will be considered a deviation from the established procedure.';
  const noticeLines = wrapText(font, notice, 7, CW);
  let ny = footerY + 14;
  for (const line of noticeLines) {
    // Bold the "Confidentiality Notice:" part
    const usedFont = line.startsWith('Confidentiality') ? fontBold : font;
    page.drawText(line, { x: ML, y: ny, size: 7, font: usedFont, color: LIGHT_GRAY });
    ny -= 9;
  }

  const contact = '1+54 9 11 5581-3098 | seleccion.2@accel-rh.com | www.accel-rh.com';
  const contactW = font.widthOfTextAtSize(contact, 7);
  page.drawText(contact, { x: (PW - contactW) / 2, y: ny - 2, size: 7, font, color: LIGHT_GRAY });
}

function drawRadarChart(page: PDFPage, detalles: ScoreDetalle[], font: PDFFont, startY: number): number {
  if (detalles.length === 0) return startY;

  const chartH = 248;
  const cx = PW / 2;
  const cy = startY - chartH / 2 - 6;
  const r = 98;
  const n = detalles.length;
  const maxVal = Math.max(...detalles.map((d) => Number(d.puntaje_max) || 0), 1);
  const levels = 5;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const ratio = (Number(value) || 0) / maxVal;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle), angle };
  };

  const drawPolygon = (pts: { x: number; y: number }[], thickness: number, color: ReturnType<typeof rgb>) => {
    for (let i = 0; i < pts.length; i++) {
      const next = (i + 1) % pts.length;
      page.drawLine({ start: pts[i], end: pts[next], thickness, color });
    }
  };

  // Grid polygons
  for (let l = 1; l <= levels; l++) {
    const pts = Array.from({ length: n }, (_, i) => getPoint(i, (maxVal * l) / levels));
    drawPolygon(pts, 0.7, rgb(0.85, 0.85, 0.85));
  }

  // Axes
  for (let i = 0; i < n; i++) {
    const p = getPoint(i, maxVal);
    page.drawLine({ start: { x: cx, y: cy }, end: p, thickness: 0.7, color: rgb(0.83, 0.83, 0.83) });
  }

  // Max + value polygons (outline, always visible)
  const maxPts = detalles.map((d, i) => getPoint(i, Number(d.puntaje_max) || 0));
  drawPolygon(maxPts, 1.2, rgb(0.78, 0.78, 0.82));

  const valPts = detalles.map((d, i) => getPoint(i, Number(d.puntaje) || 0));
  drawPolygon(valPts, 2, ACCENT);

  // Light spokes to improve readability of value area
  for (const p of valPts) {
    page.drawLine({ start: { x: cx, y: cy }, end: p, thickness: 0.6, color: rgb(0.75, 0.72, 0.88), opacity: 0.45 });
  }

  // Value points + numeric labels
  valPts.forEach((p, i) => {
    const d = detalles[i];
    const value = Number(d.puntaje) || 0;
    page.drawCircle({ x: p.x, y: p.y, size: 2.6, color: ACCENT });

    const offset = 8;
    const tx = p.x + Math.cos(p.angle) * offset;
    const ty = p.y + Math.sin(p.angle) * offset;
    page.drawText(`${value}`, { x: tx, y: ty, size: 7, font, color: ACCENT });
  });

  // Criteria labels
  detalles.forEach((d, i) => {
    const p = getPoint(i, maxVal * 1.34);
    const words = d.criterio.split(' ');
    const lines: string[] = [];
    let current = '';

    words.forEach((w) => {
      if ((current + ' ' + w).trim().length > 22) {
        lines.push(current.trim());
        current = w;
      } else {
        current = (current + ' ' + w).trim();
      }
    });
    if (current) lines.push(current);

    lines.forEach((line, li) => {
      const safeLine = line.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
      if (!safeLine) return;

      const textW = font.widthOfTextAtSize(safeLine, 8);
      let tx = p.x;
      if (p.x < cx - 10) tx = p.x - textW;
      else if (p.x > cx + 10) tx = p.x;
      else tx = p.x - textW / 2;

      try {
        page.drawText(safeLine, { x: tx, y: p.y - li * 10, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
      } catch {
        // Skip unencodable text
      }
    });
  });

  // Percentage labels
  for (let l = 1; l <= levels; l++) {
    const pct = `${Math.round((l / levels) * 100)}%`;
    const p = getPoint(0, (maxVal * l) / levels);
    page.drawText(pct, { x: p.x + 6, y: p.y + 2, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
  }

  return startY - chartH - 12;
}

function drawBarChart(
  page: PDFPage, detalles: ScoreDetalle[], font: PDFFont, fontBold: PDFFont, startY: number,
): number {
  const barH = 14;
  const gap = 8;
  const labelW = 200;
  const scoreW = 50;
  const barMaxW = CW - labelW - scoreW - 10;
  let y = startY;

  // Legend
  const legendY = y + 2;
  // Max legend
  page.drawRectangle({ x: ML + labelW, y: legendY, width: 12, height: 8, color: rgb(0.88, 0.87, 0.92) });
  page.drawText('Máximo', { x: ML + labelW + 16, y: legendY + 1, size: 8, font, color: GRAY });
  // Score legend
  page.drawRectangle({ x: ML + labelW + 70, y: legendY, width: 12, height: 8, color: ACCENT });
  page.drawText('Puntaje', { x: ML + labelW + 86, y: legendY + 1, size: 8, font: fontBold, color: ACCENT });
  y -= 18;

  for (const d of detalles) {
    // Truncate label
    let label = d.criterio;
    const maxLabelChars = 28;
    if (label.length > maxLabelChars) label = label.substring(0, maxLabelChars) + '...';

    // Label
    page.drawText(label, { x: ML, y: y + 2, size: 9, font: fontBold, color: TEXT_COLOR });

    // Background bar (max)
    const barX = ML + labelW;
    const maxBarW = barMaxW;
    page.drawRectangle({
      x: barX, y: y - 1, width: maxBarW, height: barH,
      color: rgb(0.88, 0.87, 0.92),
    });

    // Score bar
    const ratio = d.puntaje_max > 0 ? d.puntaje / d.puntaje_max : 0;
    const scoreBarW = Math.max(barMaxW * ratio, 2);
    page.drawRectangle({
      x: barX, y: y - 1, width: scoreBarW, height: barH,
      color: ACCENT,
    });

    // Score text
    const scoreText = `${d.puntaje}/${d.puntaje_max}`;
    const scoreTextW = font.widthOfTextAtSize(scoreText, 9);
    page.drawText(scoreText, {
      x: PW - MR - scoreTextW, y: y + 2, size: 9, font, color: TEXT_COLOR,
    });

    y -= barH + gap;
  }

  return y;
}
