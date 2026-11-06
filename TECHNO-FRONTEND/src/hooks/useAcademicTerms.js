import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios'
import { useSchoolActivity } from './useSchoolActivity'

// The school's academic calendar (set by the admin) and which term today
// falls in. Live: refetches when the admin edits the calendar, and again
// just after local midnight so the term rolls over by itself (e.g. the day
// 2nd Semester starts) without anyone reloading.
export function useAcademicTerms() {
  const [terms, setTerms] = useState([])
  const [currentTermId, setCurrentTermId] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(() => api.get('/terms').then(res => {
    setTerms(res.data.terms || [])
    setCurrentTermId(res.data.current_term_id ?? null)
  }).catch(() => {}).finally(() => setLoaded(true)), [])

  useEffect(() => { reload() }, [reload])
  useSchoolActivity(['terms'], reload)

  useEffect(() => {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
    const id = setTimeout(reload, nextMidnight - now)
    return () => clearTimeout(id)
  }, [reload, currentTermId])

  const currentTerm = terms.find(t => t.id === currentTermId) || null
  // Newest academic year first.
  const years = [...new Set(terms.map(t => t.academic_year))].sort().reverse()

  return { terms, years, currentTerm, loaded, reload }
}

export const termLabel = t => (t ? `${t.name}, A.Y. ${t.academic_year.replace('-', '–')}` : '')
