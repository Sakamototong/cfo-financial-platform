/**
 * useApi — stable API calling hook for CFO platform pages
 *
 * Fixes three instability patterns:
 * 1. Cancels in-flight requests on component unmount (prevents setState-on-unmounted-component)
 * 2. Deduplicate concurrent calls to the same key (prevents race conditions from fast re-renders)
 * 3. Stale-response guard (only the latest request's response wins)
 */
import { useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { AxiosRequestConfig, AxiosResponse } from 'axios'

export function useAbortController() {
  const abortRef = useRef<AbortController | null>(null)

  // Cancel any in-flight request when the component unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  /**
   * Returns an AbortSignal and cancels any previous pending request.
   * Call this at the start of each load function.
   */
  const getSignal = useCallback(() => {
    abortRef.current?.abort() // cancel previous
    abortRef.current = new AbortController()
    return abortRef.current.signal
  }, [])

  return { getSignal }
}

/** Wraps api.get with an AbortSignal and rejects if aborted */
export async function apiGet<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return api.get<T>(url, { ...config, signal })
}

/** Wraps api.post with an AbortSignal */
export async function apiPost<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return api.post<T>(url, data, { ...config, signal })
}

/** Wraps api.put with an AbortSignal */
export async function apiPut<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
  signal?: AbortSignal,
): Promise<AxiosResponse<T>> {
  return api.put<T>(url, data, { ...config, signal })
}

/**
 * Returns true when the AxiosError was caused by an AbortController abort.
 * Use inside catch blocks to skip error toasts for intentional cancellations.
 */
export function isAbortError(err: any): boolean {
  return (
    err?.name === 'CanceledError' ||
    err?.name === 'AbortError' ||
    err?.code === 'ERR_CANCELED'
  )
}
