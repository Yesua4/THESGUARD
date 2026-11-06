import DOMPurify from 'dompurify'

// Student-authored document HTML (in-app drafts, Word files converted for
// editing, pasted content) is rendered as real HTML -- including to faculty
// -- and the API token sits in localStorage. Anything that can run code is
// removed here: <script>, on*= handlers, javascript:/data:text links,
// iframes/objects, forms, <style> blocks. Normal formatting, tables, images
// and the editor's data-page-* pagination markers are kept.
//
// The backend cleans drafts on save too (app/Services/HtmlSanitizer.php);
// this also covers drafts saved before that existed.
const FORBID_TAGS = ['style', 'script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base']

let hooked = false
function ensureHook() {
  if (hooked) return
  hooked = true
  // Links in a document never open a new window with access to this tab.
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
      node.removeAttribute('target')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export function sanitizeHtml(html) {
  ensureHook()
  return DOMPurify.sanitize(html || '', { FORBID_TAGS, ALLOW_DATA_ATTR: true })
}

// Only ordinary web/mail links may be inserted from the editor toolbar.
export const isSafeLinkUrl = url => /^(https?:\/\/|mailto:)/i.test((url || '').trim())
