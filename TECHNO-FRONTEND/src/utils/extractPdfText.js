import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import api from '../api/axios'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

// Fetches a document's PDF-renderable bytes and pulls out its plain text,
// page by page — used for version-to-version diffing, where we only need
// the words, not a rendered page.
export async function extractPdfText(documentId) {
  const res = await api.get(`/documents/${documentId}/preview`, { responseType: 'arraybuffer' })
  const pdf = await pdfjsLib.getDocument({ data: res.data }).promise

  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(content.items.map(it => it.str).join(' '))
  }
  return pageTexts.join('\n\n')
}
