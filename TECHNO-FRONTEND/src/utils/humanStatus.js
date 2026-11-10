// Turns a stored value like "for_defense" or "needs_revision" into
// readable text ("For Defense", "Needs Revision") for status pills.
export const humanStatus = s =>
  s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
