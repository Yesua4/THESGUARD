import { useEffect, useState } from 'react'
import { subscribe } from '../utils/networkActivity'

// Site-wide loading feedback (see src/utils/networkActivity.js):
// a top progress bar while anything loads, a "still working" note when it
// takes long, and an "offline" note when the connection drops.
const SHOW_BAR_AFTER_MS = 250   // don't flash the bar on fast requests
const SLOW_AFTER_MS = 6000

export default function NetworkIndicator() {
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    let barTimer = null
    let slowTimer = null
    const unsub = subscribe(pending => {
      if (pending > 0) {
        if (!barTimer && !busy) barTimer = setTimeout(() => setBusy(true), SHOW_BAR_AFTER_MS)
        if (!slowTimer) slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
      } else {
        clearTimeout(barTimer); clearTimeout(slowTimer)
        barTimer = slowTimer = null
        setBusy(false); setSlow(false)
      }
    })
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      unsub(); clearTimeout(barTimer); clearTimeout(slowTimer)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        /* Any button/link that started a request: spinner + no double clicks. */
        [data-tg-busy] { pointer-events: none !important; }
        [data-tg-spin] { cursor: progress !important; opacity: 0.75; }
        button[data-tg-spin]::after, a[data-tg-spin]::after, [role="button"][data-tg-spin]::after {
          content: ''; display: inline-block; width: 0.9em; height: 0.9em; margin-left: 0.5em;
          vertical-align: -0.12em; border: 2px solid currentColor; border-right-color: transparent;
          border-radius: 50%; animation: tg-spin 0.7s linear infinite;
        }
        @keyframes tg-spin { to { transform: rotate(360deg); } }
        @keyframes tg-bar { 0% { left: -35%; width: 35%; } 60% { left: 100%; width: 35%; } 100% { left: 100%; width: 35%; } }
        @media (prefers-reduced-motion: reduce) {
          button[data-tg-spin]::after, a[data-tg-spin]::after, [role="button"][data-tg-spin]::after { animation-duration: 2s; }
        }
      `}</style>

      {busy && (
        <div role="progressbar" aria-label="Loading" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', zIndex: 9999, overflow: 'hidden', background: 'rgba(16,64,160,0.15)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, background: 'linear-gradient(90deg,#3b82f6,#1040a0)', animation: 'tg-bar 1.2s ease-in-out infinite' }} />
        </div>
      )}

      {(slow || offline) && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: '18px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: offline ? '#7f1d1d' : '#0a1f44', color: '#fff', padding: '10px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '8px', maxWidth: 'calc(100vw - 32px)' }}>
          {offline
            ? <>⚠ You're offline. Check your internet connection, then try again.</>
            : <><span style={{ width: '12px', height: '12px', border: '2px solid #fff', borderRightColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'tg-spin 0.7s linear infinite', flexShrink: 0 }} /> Still working… your connection seems slow. Please wait, no need to click again.</>}
        </div>
      )}
    </>
  )
}
