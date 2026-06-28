import * as React from 'react'

import { cn } from '#/lib/utils.ts'

// ponytail: Tailwind's built-in animate-pulse + the soft glass tint (which
// adapts to dark mode via --glass-tint-soft) is enough — no skeleton lib, no
// custom keyframes. Add a shimmer gradient only if this reads too flat.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-[var(--glass-radius-sm)] bg-[var(--glass-tint-soft)]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
