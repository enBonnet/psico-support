// ponytail: minimal CSS spinner (no new dep). Set as the router's
// defaultPendingComponent so every CSR route (ssr:false) shows it while its
// beforeLoad/loader resolves client-side. SSR routes never hit it — their
// loaders resolve before paint. Full-height + centered so the mount of the
// real route doesn't cause a layout pop.
export function RoutePending() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <span
        className="size-6 animate-spin rounded-full border-2 border-[var(--glass-tint-soft)] border-t-[var(--medi-secondary)]"
        role="status"
        aria-label="Cargando"
      />
    </div>
  )
}
