// Removes emojis (they look different on every phone) but keeps plain
// symbols like ✓ ✕ →. Used for text that comes from the server, e.g. older
// notifications saved before the server stopped adding emojis.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{23F0}-\u{23FF}\u{2B50}\u{2B07}]|\u{FE0F}|\u{200D}/gu

export default function stripEmoji(text) {
  if (typeof text !== 'string') return text
  return text.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim()
}
