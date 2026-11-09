import axios from 'axios'
import { requestStarted, requestFinished } from '../utils/networkActivity'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  requestStarted(config) // loading spinner / top bar (src/utils/networkActivity.js)
  return config
})

api.interceptors.response.use(
  res => { requestFinished(res.config); return res },
  err => { requestFinished(err.config); return Promise.reject(err) }
)

export default api
