import { useState, useCallback, RefObject } from 'react';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/formatters';
import logoSrc from '@/assets/logo.png';
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

export default function PostulantReportPdf({ postulante, score, vacancyName, radarChartRef }: Props) {
  const [generating, setGenerating] = useState(false);

  const detalles = (score?.detalles || []) as ScoreDetalle[];

  const captureRadarChart = useCallback(async (): Promise<Uint8Array | null> => {
    if (!radarChartRef?.current) return null;
    const svgEl = radarChartRef.current.querySelector('svg');
    if (!svgEl) return null;

    // Clone SVG and set explicit dimensions
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const bbox = svgEl.getBoundingClientRect();
    clone.setAttribute('width', String(bbox.width));
    clone.setAttribute('height', String(bbox.height));
    
    // Apply computed styles to text elements
    const originalTexts = svgEl.querySelectorAll('text');
    const cloneTexts = clone.querySelectorAll('text');
    originalTexts.forEach((orig, i) => {
      const computed = window.getComputedStyle(orig);
      cloneTexts[i]?.setAttribute('fill', computed.color || '#333');
    });

    const svgData = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = bbox.width * scale;
        canvas.height = bbox.height * scale;
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.fillStyle = '#ffffff';
          ctx2d.fillRect(0, 0, canvas.width, canvas.height);
          ctx2d.scale(scale, scale);
          ctx2d.drawImage(img, 0, 0, bbox.width, bbox.height);
        }
        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(buf => {
              resolve(new Uint8Array(buf));
              URL.revokeObjectURL(url);
            });
          } else {
            resolve(null);
            URL.revokeObjectURL(url);
          }
        }, 'image/png');
      };
      img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }, [radarChartRef]);

  const generatePdf = useCallback(async () => {
    setGenerating(true);
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
        ? scoreVal >= 80 ? 'Recommended for Interview' : scoreVal >= 60 ? 'Under Review' : 'Not Recommended'
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
      y -= 24;

      // Metadata
      const metaFields = [
        ['Customer', vacancyName || postulante.vacancy_name || '—'],
        ['Role', postulante.vacancy_name || '—'],
        ['Date', formatDate(postulante.apply_date)],
        ['Candidate Name', postulante.full_name || '—'],
        ['Recruiter', 'ACCELRH'],
      ];
      for (const [label, value] of metaFields) {
        page.drawText(label, { x: ML, y, size: 11, font: helvetica, color: GRAY });
        page.drawText(value, { x: ML + 130, y, size: 11, font: helveticaBold, color: TEXT_COLOR });
        y -= 20;
      }
      y -= 10;

      // Score
      page.drawText(`AcceleRATE Match Score: ${scoreVal != null ? `${scoreVal}/100` : '—'}`, {
        x: ML, y, size: 13, font: helveticaBold, color: TEXT_COLOR,
      });
      y -= 18;
      page.drawText(`Status: ${statusText}`, {
        x: ML, y, size: 11, font: helveticaBold, color: TEXT_COLOR,
      });
      y -= 28;

      // Profile Summary
      const summaryText = postulante.screening_responses || postulante.comments_selectora || postulante.comments_manager;
      if (summaryText) {
        y = drawSectionTitle(page, helveticaBold, 'Professional Profile Summary', y);
        y = drawWrappedText(page, helvetica, summaryText, y, 10.5, TEXT_COLOR);
        y -= 16;
      }

      // Key Strengths
      if (score?.razones_top3 && score.razones_top3.length > 0) {
        y = drawSectionTitle(page, helveticaBold, 'Key Strengths (Value for the Client)', y);
        for (const r of score.razones_top3) {
          y = drawWrappedText(page, helvetica, r, y, 10.5, TEXT_COLOR);
          y -= 12;
        }
      }

      drawFooter(page, helvetica, helveticaBold);

      // ===== PAGE 2 =====
      const hasPage2 = detalles.length > 0 || (score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0);
      if (hasPage2) {
        page = pdfDoc.addPage([PW, PH]);
        drawBorder(page);
        y = PH - MT;
        y = drawHeader(page, ctx, y);

        // Scoring Breakdown - Radar chart
        if (detalles.length > 0) {
          y = drawSectionTitle(page, helveticaBold, 'Scoring Breakdown', y);
          y = drawRadarChart(page, detalles, helvetica, y);
          y -= 12;
        }

        // Logistics
        y = drawSectionTitle(page, helveticaBold, 'Logistics & Salary Expectations', y);
        y = drawWrappedText(page, helvetica, `Salary Expectation: ${postulante.salary_pretended ? formatCurrency(postulante.salary_pretended) : '—'}`, y, 10.5, TEXT_COLOR);
        y -= 2;
        y = drawWrappedText(page, helvetica, `Availability: ${postulante.contact_status || '—'}`, y, 10.5, TEXT_COLOR);
        y -= 2;
        y = drawWrappedText(page, helvetica, `Stage: ${postulante.etapa || '—'}`, y, 10.5, TEXT_COLOR);
        y -= 16;

        // Check if we need a new page
        const estimatedNotesHeight = estimateTextHeight(score?.preguntas_sugeridas || [], helvetica, 10.5) + 
          estimateTextHeight(score?.riesgos_top3 || [], helvetica, 10.5) + 100;

        if (y - estimatedNotesHeight < MB + 20) {
          // Content would overflow - add new page
          drawFooter(page, helvetica, helveticaBold);
          page = pdfDoc.addPage([PW, PH]);
          drawBorder(page);
          y = PH - MT;
          y = drawHeader(page, ctx, y);
        }

        // Interviewer Notes
        if (score?.preguntas_sugeridas && score.preguntas_sugeridas.length > 0) {
          y = drawSectionTitle(page, helveticaBold, 'Interviewer Notes (Suggested points to validate in your internal interview)', y);
          for (const q of score.preguntas_sugeridas) {
            if (y < MB + 60) {
              drawFooter(page, helvetica, helveticaBold);
              page = pdfDoc.addPage([PW, PH]);
              drawBorder(page);
              y = PH - MT;
              y = drawHeader(page, ctx, y);
            }
            y = drawWrappedText(page, helvetica, q, y, 10.5, TEXT_COLOR);
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
          y = drawSectionTitle(page, helveticaBold, 'Risks to Consider', y);
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
        y -= 16;
        page.drawText('Sincerely,', { x: ML, y, size: 10.5, font: helvetica, color: TEXT_COLOR });
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
  }, [postulante, score, detalles, vacancyName]);

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
  const chartW = 360;
  const chartH = 280;
  const cx = PW / 2;
  const cy = startY - chartH / 2;
  const r = 110;
  const n = detalles.length;
  const maxVal = Math.max(...detalles.map(d => d.puntaje_max), 1);
  const levels = 5;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const ratio = value / maxVal;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle) };
  };

  // Grid
  for (let l = 1; l <= levels; l++) {
    const pts = Array.from({ length: n }, (_, i) => getPoint(i, (maxVal * l) / levels));
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      page.drawLine({ start: pts[i], end: pts[next], thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    }
  }

  // Axes
  for (let i = 0; i < n; i++) {
    const p = getPoint(i, maxVal);
    page.drawLine({ start: { x: cx, y: cy }, end: p, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  }

  // Value polygon (draw lines)
  const valPts = detalles.map((d, i) => getPoint(i, d.puntaje));
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    page.drawLine({ start: valPts[i], end: valPts[next], thickness: 1.5, color: rgb(0.357, 0.31, 0.71) });
  }

  // Value dots
  for (const pt of valPts) {
    page.drawCircle({ x: pt.x, y: pt.y, size: 2.5, color: rgb(0.357, 0.31, 0.71) });
  }

  // Labels
  detalles.forEach((d, i) => {
    const p = getPoint(i, maxVal * 1.25);
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
      const textW = font.widthOfTextAtSize(line, 8);
      let tx = p.x;
      if (p.x < cx - 10) tx = p.x - textW;
      else if (p.x > cx + 10) tx = p.x;
      else tx = p.x - textW / 2;

      page.drawText(line, { x: tx, y: p.y - li * 10, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    });
  });

  // Percentage labels
  for (let l = 1; l <= levels; l++) {
    const pct = `${Math.round((l / levels) * 100)}%`;
    const p = getPoint(0, (maxVal * l) / levels);
    page.drawText(pct, { x: p.x + 4, y: p.y + 2, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
  }

  return startY - chartH - 8;
}
