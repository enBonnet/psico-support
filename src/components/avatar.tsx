import { cn } from '#/lib/utils'
import { publicAvatarUrl } from '#/server/professionals'

// ponytail: shared avatar with initials fallback. Used by the public profile
// (large) + the pro panel (medium). Size + text are driven by className so each
// surface sizes it without a prop (cn/twMerge lets callers override the default
// text-xl). avatarKey is null until the pro uploads one (post-signup).
export function Avatar({
  name,
  avatarKey,
  className,
}: {
  name: string
  avatarKey: string | null
  className?: string
}) {
  const url = avatarKey ? publicAvatarUrl(avatarKey) : null
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--medi-primary)]/10 text-xl font-bold text-[var(--medi-primary)]',
        className,
      )}
      aria-hidden="true"
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
