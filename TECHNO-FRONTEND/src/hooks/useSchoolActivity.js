import { useEffect, useRef } from 'react'
import echo from '../echo'
import { useAuth } from '../context/AuthContext'

// School-wide live refresh. The backend sends a "these kinds of data
// changed" signal on `School.{id}` whenever any of the school's data is
// saved or deleted (LiveUpdateService::MODEL_TYPES lists the kinds:
// projects, groups, schedules, rooms, documents, evaluations, tasks,
// contributions, minutes, checklists, users, roster).
//
// `useSchoolActivity(['groups', 'projects'], reload)` calls `reload()` when
// any of those kinds changed. Bursts are collapsed (one reload per 400ms),
// and the data itself is always refetched through the page's own API calls,
// so each user still only ever sees what they're allowed to.
//
// stopListening (not leave) on cleanup, since many mounted components share
// the one channel.
export function useSchoolActivity(types, onChange) {
  const { user } = useAuth()
  const schoolId = user?.school_id
  const handlerRef = useRef(onChange)
  useEffect(() => { handlerRef.current = onChange })
  const key = [...types].sort().join(',')

  useEffect(() => {
    if (!schoolId || !key) return
    const wanted = new Set(key.split(','))
    let timer = null
    const channel = echo.private(`School.${schoolId}`)
    const listener = e => {
      if (!(e.types || []).some(t => wanted.has(t))) return
      clearTimeout(timer)
      timer = setTimeout(() => handlerRef.current?.(e.types), 400)
    }
    channel.listen('.school.activity', listener)
    return () => {
      clearTimeout(timer)
      channel.stopListening('.school.activity', listener)
    }
  }, [schoolId, key])
}
