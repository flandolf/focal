import { useRef, useEffect } from "react"

/**
 * Returns a ref that always holds the latest value, solving the stale-closure
 * problem in callbacks that don't need to be recreated.
 *
 * Use this when you need a stable callback reference that still accesses
 * the most current state (e.g. inside async operations, event handlers, or
 * intervals that shouldn't re-register on every render).
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
