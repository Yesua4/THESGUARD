import { useEffect, useRef } from 'react'
import echo from '../echo'

// Live refresh for school-wide staff lists (User Accounts, Class Roster).
// Subscribes to `School.{id}.staff` -- routes/channels.php only lets the
// school's admins and instructors in -- and calls `onChange(type)` whenever
// an account or the roster changes (user created/edited/deleted, class list
// imported, a student signed up and was enrolled).
//
// stopListening (not leave) on cleanup, so two mounted lists sharing the
// channel (e.g. User Accounts with the Class Roster open on top) don't tear
// it down for each other.
export function useSchoolStaffChannel(schoolId, enabled, onChange) {
  const handlerRef = useRef(onChange)
  useEffect(() => { handlerRef.current = onChange })

  useEffect(() => {
    if (!schoolId || !enabled) return
    const channel = echo.private(`School.${schoolId}.staff`)
    const listener = e => handlerRef.current?.(e.type)
    channel.listen('.directory.changed', listener)
    return () => channel.stopListening('.directory.changed', listener)
  }, [schoolId, enabled])
}
