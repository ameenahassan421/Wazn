/**
 * A CSV reader small enough to put in the client bundle.
 *
 * `scripts/import_hevy.ts` uses `csv-parse`, which is right for a Node script
 * and wrong here: the precache ceiling is ~600 KiB and currently sits at 587,
 * so a full parser is most of the remaining headroom for a file the user
 * opens once. This is RFC 4180 — quoted fields, embedded commas, embedded
 * newlines, `""` as an escaped quote — and nothing else, which is all a Hevy
 * export needs.
 *
 * It is deliberately total. Somebody's training history is the input, and the
 * failure mode that matters is a wrong or truncated file, so nothing here
 * throws: a malformed row is a short row, and the caller decides what that
 * means.
 */

/** Rows of raw cells, in file order. Empty input gives an empty array. */
export function parseCsv(text: string): string[][] {
  // A BOM survives every round trip through Excel and would otherwise become
  // part of the first header's name, so the first column would never match.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let started = false

  const endField = () => {
    row.push(field)
    field = ''
    started = true
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
    started = false
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
    } else if (char === ',') {
      endField()
    } else if (char === '\n') {
      endRow()
    } else if (char === '\r') {
      // Consume CRLF as one break; a lone CR is a break too.
      if (input[i + 1] === '\n') i += 1
      endRow()
    } else {
      field += char
    }
  }

  // A file that does not end in a newline still has a last row. A file that
  // does must not gain an empty one.
  if (field !== '' || started || row.length > 0) endRow()

  return rows
}

/**
 * Header row plus data rows, as objects keyed by trimmed header name.
 *
 * Rows shorter than the header get empty strings rather than `undefined`, so
 * every caller can treat a missing cell and a blank cell the same way — a
 * truncated export is the common bad file and it should read as blank data,
 * not as a crash.
 */
export function toRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows
  if (!header) return []
  const keys = header.map((h) => h.trim())

  return (
    body
      // A trailing blank line parses as one empty cell; it is not a row.
      .filter((cells) => cells.some((cell) => cell.trim() !== ''))
      .map((cells) => {
        const record: Record<string, string> = {}
        for (const [i, key] of keys.entries()) record[key] = (cells[i] ?? '').trim()
        return record
      })
  )
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  return toRecords(parseCsv(text))
}
