// HTML / JSON-in-script escaping helpers for server-rendered pages.
// Use escapeHtml for any untrusted string interpolated into HTML text or
// attribute values. Use escapeJsonForScript when serializing a JS value
// inside a <script>...</script> block.

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

// Escapes characters that would let a string break out of a <script> tag
// or an HTML comment, and neutralizes U+2028 / U+2029 which are valid JSON
// but illegal JS line terminators. Safe to place the return value inside a
// <script type="application/json"> ... </script> block.
export function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
