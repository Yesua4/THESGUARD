import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/axios'

// Comments for one document version (plus unresolved ones carried over from
// earlier versions of the same chapter), and every action on them. What the
// current user may do comes from the server as `comment.can`; status changes
// send the comment's lock_version so a conflicting change by someone else is
// refused (409) instead of silently overwritten -- the list is then reloaded.
export function useDocumentComments(documentId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Carried-over comments still belong to THEIR version (never moved), so
  // actions on them go to that version's document id.
  const commentsRef = useRef([])
  useEffect(() => { commentsRef.current = comments }, [comments])
  const find = useCallback(id => commentsRef.current.find(c => c.id === id), [])
  const base = useCallback(id => `/documents/${find(id)?.document_id ?? documentId}/comments/${id}`, [find, documentId])

  const load = useCallback(() => {
    if (!documentId) return Promise.resolve()
    setLoading(true)
    return api.get(`/documents/${documentId}/comments`)
      .then(res => { setComments(res.data); setError('') })
      .catch(() => setError('Could not load comments.'))
      .finally(() => setLoading(false))
  }, [documentId])

  useEffect(() => { load() }, [load])

  // Runs an action, reloads, and re-throws with a readable message so the
  // calling form can show it next to the button that was pressed.
  const act = useCallback(async (fn, fallback) => {
    try {
      const res = await fn()
      await load()
      return res?.data
    } catch (err) {
      if (err.response?.status === 409) await load()
      const errors = err.response?.data?.errors
      const message = errors ? Object.values(errors)[0][0] : (err.response?.data?.message || fallback)
      setError(message)
      const e = new Error(message)
      e.response = err.response
      throw e
    }
  }, [load])

  const lockOf = useCallback(id => find(id)?.lock_version ?? 0, [find])

  const addComment = useCallback(({ pageNumber, selectedText, anchor, comment }) => act(() => api.post(`/documents/${documentId}/comments`, {
    page_number: pageNumber, selected_text: selectedText || null, anchor: anchor || null, comment,
  }), 'Could not add comment.'), [act, documentId])

  const deleteComment = useCallback(id => act(() => api.delete(base(id)), 'Could not delete comment.'), [act, base])

  const reply = useCallback((id, body) => act(() => api.post(`${base(id)}/replies`, { body }), 'Could not send reply.'), [act, base])

  const start = useCallback(id => act(() => api.post(`${base(id)}/start`, { lock_version: lockOf(id) }), 'Could not update the comment.'), [act, base, lockOf])

  const submitCorrection = useCallback((id, { revisionDocumentId, explanation }) => act(() => api.post(`${base(id)}/submit`, {
    lock_version: lockOf(id), revision_document_id: revisionDocumentId, explanation,
  }), 'Could not submit your correction.'), [act, base, lockOf])

  const verify = useCallback((id, decision, note) => act(() => api.post(`${base(id)}/verify`, {
    lock_version: lockOf(id), decision, note: note || null,
  }), 'Could not save your decision.'), [act, base, lockOf])

  const reopen = useCallback((id, note) => act(() => api.post(`${base(id)}/reopen`, { lock_version: lockOf(id), note }), 'Could not reopen the comment.'), [act, base, lockOf])

  const resolve = useCallback(id => act(() => api.put(`${base(id)}/resolve`, { status: 'resolved', lock_version: lockOf(id) }), 'Could not resolve the comment.'), [act, base, lockOf])

  const history = useCallback(id => api.get(base(id)).then(res => res.data), [base])

  return {
    comments, loading, error, clearError: () => setError(''), reload: load,
    addComment, deleteComment, reply, start, submitCorrection, verify, reopen, resolve, history,
  }
}
