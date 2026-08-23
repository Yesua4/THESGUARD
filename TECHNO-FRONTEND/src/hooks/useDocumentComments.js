import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

export function useDocumentComments(documentId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!documentId) return Promise.resolve()
    setLoading(true)
    return api.get(`/documents/${documentId}/comments`)
      .then(res => { setComments(res.data); setError('') })
      .catch(() => setError('Could not load comments.'))
      .finally(() => setLoading(false))
  }, [documentId])

  useEffect(() => { load() }, [load])

  const addComment = useCallback(async ({ pageNumber, selectedText, anchor, comment }) => {
    await api.post(`/documents/${documentId}/comments`, {
      page_number: pageNumber,
      selected_text: selectedText || null,
      anchor: anchor || null,
      comment,
    })
    await load()
  }, [documentId, load])

  const deleteComment = useCallback(async commentId => {
    await api.delete(`/documents/${documentId}/comments/${commentId}`)
    await load()
  }, [documentId, load])

  const setResolved = useCallback(async (commentId, resolved) => {
    await api.put(`/documents/${documentId}/comments/${commentId}/resolve`, {
      status: resolved ? 'resolved' : 'open',
    })
    await load()
  }, [documentId, load])

  return { comments, loading, error, addComment, deleteComment, setResolved, reload: load }
}
