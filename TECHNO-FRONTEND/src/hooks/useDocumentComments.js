import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/axios'

export function useDocumentComments(documentId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Comments carried over from an earlier version still belong to THAT
  // version (they're never moved), so actions on them go to its document id.
  const commentsRef = useRef([])
  useEffect(() => { commentsRef.current = comments }, [comments])
  const docOf = useCallback(
    commentId => commentsRef.current.find(c => c.id === commentId)?.document_id ?? documentId,
    [documentId])

  const load = useCallback(() => {
    if (!documentId) return Promise.resolve()
    setLoading(true)
    return api.get(`/documents/${documentId}/comments`)
      .then(res => { setComments(res.data); setError('') })
      .catch(() => setError('Could not load comments.'))
      .finally(() => setLoading(false))
  }, [documentId])

  useEffect(() => { load() }, [load])

  // Each mutation records its failure to the shared `error` state (so a
  // sidebar without its own dedicated error UI, like CommentSidebar's
  // delete/resolve buttons, still surfaces something) AND re-throws, so a
  // caller with its own local error UI (like CommentComposer's popover) can
  // show something more contextual too, instead of the failure vanishing
  // silently either way.
  const addComment = useCallback(async ({ pageNumber, selectedText, anchor, comment }) => {
    try {
      await api.post(`/documents/${documentId}/comments`, {
        page_number: pageNumber,
        selected_text: selectedText || null,
        anchor: anchor || null,
        comment,
      })
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add comment.')
      throw err
    }
  }, [documentId, load])

  const deleteComment = useCallback(async commentId => {
    try {
      await api.delete(`/documents/${docOf(commentId)}/comments/${commentId}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete comment.')
      throw err
    }
  }, [docOf, load])

  const setResolved = useCallback(async (commentId, resolved) => {
    try {
      await api.put(`/documents/${docOf(commentId)}/comments/${commentId}/resolve`, {
        status: resolved ? 'resolved' : 'open',
      })
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update comment status.')
      throw err
    }
  }, [docOf, load])

  return { comments, loading, error, addComment, deleteComment, setResolved, reload: load }
}
