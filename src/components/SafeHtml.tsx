import DOMPurify from 'dompurify';

interface Props {
  html: string;
  className?: string;
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ol', 'ul', 'li',
  'h1', 'h2', 'h3', 'h4',
  'blockquote', 'code', 'pre',
  'a', 'span',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function SafeHtml({ html, className = '' }: Props) {
  const clean = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
  });
  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
