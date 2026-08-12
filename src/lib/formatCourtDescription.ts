function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape text, then turn http(s) URLs into clickable links. */
function formatInlineHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2D5A27; text-decoration: underline;">${url}</a>`
  );
}

/** Renders court CSV tips as HTML: bold section headings (lines ending with :) and proper ul/li bullets. */
export function formatCourtDescriptionHtml(description: string): string {
  const lines = description
    .split('\n')
    .map((line) => line.trim().replace(/^[•*]\s*/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const parts: string[] = [
    '<div style="margin: 8px 0 0 0; border-top: 1px solid #eee; padding-top: 8px;">',
  ];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      parts.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    if (line.endsWith(':')) {
      closeList();
      parts.push(
        `<p style="margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; color: #333;">${escapeHtml(line)}</p>`
      );
    } else {
      if (!listOpen) {
        parts.push(
          '<ul style="margin: 0 0 6px 0; padding-left: 18px; font-size: 12px; color: #555; line-height: 1.45; list-style-type: disc;">'
        );
        listOpen = true;
      }
      parts.push(`<li style="margin: 2px 0;">${formatInlineHtml(line)}</li>`);
    }
  }

  closeList();
  parts.push('</div>');
  return parts.join('');
}
