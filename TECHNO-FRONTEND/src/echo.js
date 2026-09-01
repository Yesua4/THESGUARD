import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

// Private channels need the request signed by the backend, and this app
// authenticates with a Sanctum Bearer token (not session cookies) -- Echo's
// default authorizer sends cookies, so a custom one is needed to attach the
// token from localStorage instead. Uses the same relative '/api/...' path
// axios uses, which the vercel.json rewrite (prod) / Vite dev proxy (local)
// both already forward to the real backend, so no separate backend URL
// needs configuring here.
const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
  wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
  authorizer: (channel) => ({
    authorize: (socketId, callback) => {
      fetch('/api/broadcasting/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
      })
        .then(res => {
          if (!res.ok) throw new Error(`broadcasting auth failed: ${res.status}`)
          return res.json()
        })
        .then(data => callback(false, data))
        .catch(err => callback(true, err))
    },
  }),
})

export default echo
