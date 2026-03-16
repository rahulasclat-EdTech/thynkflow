import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.API_URL || 'http://localhost:5000/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
})

api.interceptors.request.use(async config => {
  const token = await SecureStore.getItemAsync('tf_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res.data,
  err => {
    const message = err.response?.data?.message || err.message || 'Network error'
    return Promise.reject(new Error(message))
  }
)

export default api
