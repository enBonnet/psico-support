import { useEffect, useState } from 'react'

// ponytail: tiny debounce so typing in a search box doesn't fire one server
// fn per keystroke. 300ms matches typical "stopped typing" cadence. Pair with
// `placeholderData: keepPreviousData` on the consuming query so the previous
// results stay visible during the debounce window (no flash/suspend).
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
