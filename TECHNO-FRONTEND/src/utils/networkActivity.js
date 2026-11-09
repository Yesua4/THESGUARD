// Tracks requests in flight so the user always sees that something is
// happening, even on a weak connection:
//  - the button (or form) that started a request shows a spinner and can't
//    be clicked twice until the request finishes;
//  - a thin bar runs along the top of the screen while anything is loading;
//  - a "still working" note appears when a request takes a long time.
// Hooked into src/api/axios.js, so every button gets it automatically.

const CLICK_WINDOW_MS = 1000 // a request this soon after a click belongs to it
const BUSY_ATTR = 'data-tg-busy'

let pending = 0
let lastTrigger = null // { el, at }
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(pending))

export const subscribe = fn => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Remember the button the user just clicked (or the form they submitted).
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const el = e.target.closest?.('button, [role="button"], a, input[type="submit"], input[type="checkbox"], select')
    if (el) lastTrigger = { el, at: Date.now() }
  }, true)
  document.addEventListener('submit', e => {
    const el = e.target.querySelector?.('[type="submit"]') || e.target
    lastTrigger = { el, at: Date.now() }
  }, true)
  document.addEventListener('change', e => {
    if (e.target.matches?.('select, input[type="checkbox"], input[type="file"]')) lastTrigger = { el: e.target, at: Date.now() }
  }, true)
}

const busyCount = new WeakMap()
const markBusy = el => {
  const n = (busyCount.get(el) || 0) + 1
  busyCount.set(el, n)
  if (n === 1) { el.setAttribute(BUSY_ATTR, ''); el.setAttribute('aria-busy', 'true') }
}
const unmarkBusy = el => {
  const n = (busyCount.get(el) || 1) - 1
  busyCount.set(el, n)
  if (n <= 0) { el.removeAttribute(BUSY_ATTR); el.removeAttribute('aria-busy') }
}

export function requestStarted(config) {
  pending++
  if (lastTrigger && Date.now() - lastTrigger.at < CLICK_WINDOW_MS && lastTrigger.el.isConnected) {
    config._tgEl = lastTrigger.el
    markBusy(lastTrigger.el)
  }
  notify()
}

export function requestFinished(config) {
  pending = Math.max(0, pending - 1)
  if (config?._tgEl) { unmarkBusy(config._tgEl); config._tgEl = null }
  notify()
}
