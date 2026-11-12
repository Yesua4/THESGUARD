// Degree programs. One program can be written many ways ("BSIT", "BS IT",
// "BS Information Technology", "Bachelor of Science in Information
// Technology"); these helpers treat them as the same so the archive filter
// doesn't split one program into several.
export const PROGRAMS = [
  { code: 'BSIT',  name: 'BS Information Technology',   match: /INFORMATION\s*TECHNOLOGY/ },
  { code: 'BSCS',  name: 'BS Computer Science',         match: /COMPUTER\s*SCIENCE/ },
  { code: 'BSIS',  name: 'BS Information Systems',      match: /INFORMATION\s*SYSTEM/ },
  { code: 'BSEMC', name: 'BS Entertainment and Multimedia Computing', match: /ENTERTAINMENT|MULTIMEDIA/ },
  { code: 'BLIS',  name: 'Bachelor of Library and Information Science', match: /LIBRARY/ },
]

// A stable key for a program however it was typed ('BSIT' for all the BSIT
// spellings). Unknown programs keep their own (cleaned-up) text.
export function programKey(text) {
  const t = String(text || '').toUpperCase().trim()
  if (!t) return ''
  const known = PROGRAMS.find(p => p.match.test(t) || t.replace(/[^A-Z]/g, '') === p.code)
  return known ? known.code : t.replace(/\s+/g, ' ')
}

// The standard name to show for a key, or the text as typed.
export function programName(text) {
  const known = PROGRAMS.find(p => p.code === programKey(text))
  return known ? known.name : String(text || '').trim()
}

// "BSIT 4B" -> "BS Information Technology" (the letters before the year
// level). '' when the section doesn't start with a known program code.
export function programFromSection(section) {
  const code = String(section || '').toUpperCase().match(/^\s*([A-Z]+)/)?.[1]
  return PROGRAMS.find(p => p.code === code)?.name || ''
}
