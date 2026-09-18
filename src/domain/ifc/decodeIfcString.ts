// Decodes ISO 10303-21 (STEP) string escapes as used in IFC files:
//   \X\hh        one ISO-8859-1 character (hex)
//   \X2\hhhh…\X0\ UTF-16 code units (4 hex digits each)
//   \X4\hhhhhhhh…\X0\ UTF-32 code points (8 hex digits each)
//   \S\c         ISO-8859-1 upper half: code point of c + 128
//   \\           a literal backslash
// Text without escapes is returned unchanged, so decoding is idempotent for plain text.
export function decodeIfcString(text: string): string {
  if (!text.includes('\\')) return text

  return text
    .replace(/\\X2\\((?:[0-9A-Fa-f]{4})+)\\X0\\/g, (_, hex: string) =>
      String.fromCharCode(...chunk(hex, 4).map((h) => parseInt(h, 16))),
    )
    .replace(/\\X4\\((?:[0-9A-Fa-f]{8})+)\\X0\\/g, (_, hex: string) =>
      String.fromCodePoint(...chunk(hex, 8).map((h) => parseInt(h, 16))),
    )
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 128))
    .replace(/\\\\/g, '\\')
}

function chunk(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}
