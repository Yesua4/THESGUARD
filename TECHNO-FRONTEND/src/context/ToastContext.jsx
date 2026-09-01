import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext()

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback(id => {
    setToasts(t => t.filter(x => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  // type: 'error' | 'success'. Replaces the app's scattered native alert()
  // calls (which look jarringly out of place next to the rest of the
  // custom-styled UI) with a consistent, non-blocking toast instead.
  const showToast = useCallback((message, type = 'error', duration = 5000) => {
    const id = ++idCounter
    setToasts(t => [...t, { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px',
      }}>
        {toasts.map(t => (
          <div key={t.id} onClick={() => dismiss(t.id)} style={{
            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', lineHeight: 1.5,
            whiteSpace: 'pre-line',
            background: t.type === 'success' ? '#0a1f44' : '#fff',
            color: t.type === 'success' ? '#fff' : '#0a1f44',
            border: t.type === 'success' ? 'none' : '1.5px solid #fecaca',
            borderLeft: `4px solid ${t.type === 'success' ? '#22c55e' : '#dc2626'}`,
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
