import type { FetchOptions } from 'ofetch'
import { PLATFORM_TOKEN_KEY, TENANT_TOKEN_KEY } from '#shared/utils/auth-rules'

// SEMUA panggilan API internal memakai apiFetch, bukan $fetch polos.
// $fetch yang di-auto-import ditangkap saat modul dievaluasi, jadi plugin yang
// mengganti global tidak terlihat. apiFetch membuat kliennya secara malas.

function storageKeyFor(url: string): string | null {
  if (url.startsWith('/api/admin/')) return PLATFORM_TOKEN_KEY
  if (url.startsWith('/api/app/') || url.startsWith('/api/v1/')) return TENANT_TOKEN_KEY
  return null
}

function requestUrl(request: unknown): string {
  if (typeof request === 'string') return request
  if (request && typeof request === 'object' && 'url' in request) return String((request as { url: string }).url)
  return ''
}

type MutationListener = (url: string) => void
const mutationListeners = new Set<MutationListener>()
const unauthorizedListeners = new Set<(storageKey: string) => void>()

export function onApiMutation(listener: MutationListener): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

export function onApiUnauthorized(listener: (storageKey: string) => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

type FetchFn = <T = unknown>(request: string, options?: FetchOptions<'json'>) => Promise<T>

let client: FetchFn | null = null

function getClient(): FetchFn {
  if (import.meta.server) return globalThis.$fetch as unknown as FetchFn
  client ??= globalThis.$fetch.create({
    onRequest({ request, options }) {
      const key = storageKeyFor(requestUrl(request))
      if (!key) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (!headers.has('authorization')) {
        const token = localStorage.getItem(key)
        if (token) headers.set('authorization', `Bearer ${token}`)
      }
      options.headers = headers
    },
    onResponse({ request, options, response }) {
      const method = (options.method || 'GET').toString().toUpperCase()
      if (response.ok && method !== 'GET' && method !== 'HEAD') {
        const url = requestUrl(request)
        for (const listener of mutationListeners) listener(url)
      }
    },
    onResponseError({ request, response }) {
      if (response.status !== 401) return
      const key = storageKeyFor(requestUrl(request))
      if (!key) return
      localStorage.removeItem(key)
      for (const listener of unauthorizedListeners) listener(key)
    }
  }) as unknown as FetchFn
  return client
}

export const apiFetch: FetchFn = (request, options) => getClient()(request, options)
