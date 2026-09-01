import { useEffect, useRef } from 'react'
import echo from '../echo'

// Subscribes to live activity on one project (the `Project.{id}` private
// channel -- routes/channels.php gates it to the same "who can access this
// project" rule every read endpoint already uses). `onActivity(type,
// payload)` fires for every event the backend broadcasts:
// comment_created, comment_resolved, comment_deleted, document_uploaded,
// document_status_changed, project_updated, evaluation_submitted.
//
// Uses stopListening (not echo.leave) on cleanup -- unlike the single
// per-user notification channel, more than one mounted component can
// reasonably listen to the same project at once (e.g. a project list and an
// open document-review modal), and leave() would tear the channel down out
// from under the other listener.
export function useProjectChannel(projectId, onActivity) {
  const handlerRef = useRef(onActivity)
  handlerRef.current = onActivity

  useEffect(() => {
    if (!projectId) return
    const channel = echo.private(`Project.${projectId}`)
    const listener = e => handlerRef.current?.(e.type, e.payload)
    channel.listen('.project.activity', listener)
    return () => channel.stopListening('.project.activity', listener)
  }, [projectId])
}

// List-page variant: subscribes to every project currently on screen (e.g.
// an admin's full project table) so any of them updating live refreshes the
// list, instead of only a single open project. `onActivity(projectId, type,
// payload)` fires per event.
export function useProjectsChannel(projectIds, onActivity) {
  const handlerRef = useRef(onActivity)
  handlerRef.current = onActivity
  const key = [...new Set(projectIds || [])].sort((a, b) => a - b).join(',')

  useEffect(() => {
    const ids = key ? key.split(',').map(Number) : []
    if (ids.length === 0) return
    const bindings = ids.map(id => {
      const channel = echo.private(`Project.${id}`)
      const listener = e => handlerRef.current?.(id, e.type, e.payload)
      channel.listen('.project.activity', listener)
      return { channel, listener }
    })
    return () => bindings.forEach(({ channel, listener }) => channel.stopListening('.project.activity', listener))
  }, [key])
}
