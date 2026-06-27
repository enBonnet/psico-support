'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils.ts'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[size=default]:h-[1.6rem] data-[size=default]:w-12 data-[size=sm]:h-5 data-[size=sm]:w-9',
        'glass-pill data-[state=checked]:bg-primary data-[state=checked]:border-primary/60',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-[0_2px_6px_rgba(19,41,126,0.35)] ring-0 transition-transform',
          'group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-4',
          'data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
          className,
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
