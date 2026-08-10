import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notify } from '#/lib/notifications'
import {
  listAudioCategories,
  createAudioCategory,
  updateAudioCategory,
  toggleAudioCategory,
  deleteAudioCategory,
} from '#/server/audio-stories'
import type { AudioCategory } from '#/server/audio-stories'
import { Switch } from '#/components/ui/switch'

// =============================================================================
// /admin/categorias — audio_categories CRUD
// =============================================================================
// Lifted verbatim from the old monolithic /admin/index.tsx AudioCategoriesSection
// + CategoryRow. Mirrors the optimistic-update + invalidate pattern. slug is
// immutable; title/description/sortOrder editable inline; active toggles via
// <Switch>; delete is guarded server-side against in-use categories.
// =============================================================================

export const Route = createFileRoute('/admin/categorias/')({
  component: AudioCategoriesSection,
})

// ponytail: admin CRUD for the audio_categories lookup table. Mirrors the
// optimistic-update + invalidate pattern from AudioStoriesSection. slug is
// immutable (stable analytics id); title/description/sortOrder editable
// inline; active toggles via <Switch>; delete is guarded server-side against
// in-use categories (the mutation surfaces the friendly error via notify).
// Invalidates ['audio-categories'] (this list + the pro recorder picker) and
// ['story-tray'] (the public page embeds category copy on each clip).
function AudioCategoriesSection() {
  const qc = useQueryClient()
  const { data: categories = [], isLoading } = useQuery({
    // ponytail: encode includeInactive in the key so this admin list
    // (inactive-included) doesn't collide with the pro recorder picker's
    // active-only list under the same bare key. invalidateQueries matches by
    // prefix, so ['audio-categories'] invalidations still hit both.
    queryKey: ['audio-categories', { includeInactive: true }],
    queryFn: () => listAudioCategories({ data: { includeInactive: true } }),
  })

  // new-category form state
  const [nTitle, setNTitle] = useState('')
  const [nDesc, setNDesc] = useState('')

  const createCat = useMutation({
    mutationFn: (vars: { title: string; description: string }) =>
      createAudioCategory({ data: vars }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Categoría creada' })
      setNTitle('')
      setNDesc('')
      qc.invalidateQueries({ queryKey: ['audio-categories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo crear la categoría',
        body: err.message,
      }),
  })

  const updateCat = useMutation({
    mutationFn: (vars: {
      id: number
      title?: string
      description?: string
      sortOrder?: number
    }) => updateAudioCategory({ data: vars }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Categoría actualizada' })
      qc.invalidateQueries({ queryKey: ['audio-categories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar',
        body: err.message,
      }),
  })

  const toggleCat = useMutation({
    mutationFn: (vars: { id: number; active: boolean }) =>
      toggleAudioCategory({ data: vars }),
    onMutate: async (vars) => {
      // ponytail: exact-match the admin key (the one with includeInactive) —
      // the pro picker's active-only key is unaffected and refetches normally.
      const adminKey = ['audio-categories', { includeInactive: true }] as const
      await qc.cancelQueries({ queryKey: adminKey })
      const prev = qc.getQueryData<AudioCategory[]>(adminKey)
      qc.setQueryData<AudioCategory[]>(adminKey, (old) =>
        old?.map((c) => (c.id === vars.id ? { ...c, active: vars.active } : c)),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev)
        qc.setQueryData<AudioCategory[]>(
          ['audio-categories', { includeInactive: true }],
          ctx.prev,
        )
      notify({
        type: 'error',
        title: 'No se pudo cambiar el estado',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audio-categories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
    },
  })

  const deleteCat = useMutation({
    mutationFn: (id: number) => deleteAudioCategory({ data: { id } }),
    onSuccess: () => {
      // ponytail: no analytics here — admin_audio_review is specifically for
      // pending-clip approve/reject (param1=status, param2=storyId). Firing it
      // for a category delete would pollute that metric with paramless rows.
      // A dedicated admin_audio_category_delete event would need adding to
      // TRACKED_EVENTS (append-only contract); left out as it's not a decision
      // to make silently.
      notify({ type: 'success', title: 'Categoría eliminada' })
      qc.invalidateQueries({ queryKey: ['audio-categories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar',
        body: err.message,
      }),
  })

  function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!nTitle.trim() || !nDesc.trim()) return
    createCat.mutate({ title: nTitle.trim(), description: nDesc.trim() })
  }

  return (
    <section>
      <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Categorías de audios
      </h2>
      <p className="mt-2 text-xs text-[var(--medi-text-secondary)]">
        Agrupan los audios en{' '}
        <Link to="/apoyo" className="font-semibold text-[var(--medi-secondary)]">
          Voces que acompañan
        </Link>
        . Desactiva una categoría para ocultarla sin perder los audios;
        elimínala solo si ningún audio la usa.
      </p>

      {/* New category form */}
      <form
        onSubmit={submitNew}
        className="glass-card-soft mt-3 flex flex-col gap-2 rounded-[var(--glass-radius-sm)] p-3"
      >
        <input
          className="glass-input h-12 w-full px-3 text-base"
          value={nTitle}
          onChange={(e) => setNTitle(e.target.value)}
          placeholder="Título — ej. “Meditación guiada”"
          maxLength={80}
          aria-label="Título de la nueva categoría"
        />
        <input
          className="glass-input h-12 w-full px-3 text-base"
          value={nDesc}
          onChange={(e) => setNDesc(e.target.value)}
          placeholder="Descripción corta (se muestra bajo el título)"
          maxLength={200}
          aria-label="Descripción de la nueva categoría"
        />
        <button
          type="submit"
          disabled={!nTitle.trim() || !nDesc.trim() || createCat.isPending}
          className="glass-primary min-h-11 self-start rounded-[var(--glass-radius-sm)] px-4 py-2 text-sm font-semibold !text-white disabled:opacity-50"
        >
          {createCat.isPending ? 'Creando…' : 'Nueva categoría'}
        </button>
      </form>

      {/* Category list */}
      {isLoading ? (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          Cargando…
        </p>
      ) : categories.length === 0 ? (
        <p className="glass-card-soft mt-3 p-4 text-center text-sm text-[var(--medi-text-secondary)]">
          Aún no hay categorías. Crea la primera arriba.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onToggle={(active) => toggleCat.mutate({ id: c.id, active })}
              onDelete={() => {
                if (
                  window.confirm(
                    `¿Eliminar la categoría “${c.title}”? Solo es posible si ningún audio la usa.`,
                  )
                ) {
                  deleteCat.mutate(c.id)
                }
              }}
              onSave={(patch) => updateCat.mutate({ id: c.id, ...patch })}
              saving={updateCat.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// ponytail: one row = read-only summary + inline edit mode (toggle button
// flips a local state; the form posts a partial patch). active toggles live
// (optimistic via the parent mutation); edit/delete go through confirm.
function CategoryRow({
  category,
  onToggle,
  onDelete,
  onSave,
  saving,
}: {
  category: AudioCategory
  onToggle: (active: boolean) => void
  onDelete: () => void
  onSave: (patch: {
    title?: string
    description?: string
    sortOrder?: number
  }) => void
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(category.title)
  const [description, setDescription] = useState(category.description)
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))

  function startEdit() {
    setTitle(category.title)
    setDescription(category.description)
    setSortOrder(String(category.sortOrder))
    setEditing(true)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const patch: { title?: string; description?: string; sortOrder?: number } =
      {}
    if (title.trim() && title.trim() !== category.title)
      patch.title = title.trim()
    if (description.trim() && description.trim() !== category.description)
      patch.description = description.trim()
    const n = Number(sortOrder)
    if (Number.isFinite(n) && n >= 0 && n !== category.sortOrder)
      patch.sortOrder = n
    if (Object.keys(patch).length > 0) onSave(patch)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="glass-card p-3">
        <form onSubmit={save} className="flex flex-col gap-2">
          <input
            className="glass-input h-12 w-full px-3 text-base"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            aria-label="Título"
          />
          <input
            className="glass-input h-12 w-full px-3 text-base"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            aria-label="Descripción"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--medi-text-secondary)]">
            Orden
            <input
              type="number"
              min={0}
              className="glass-input h-12 w-24 px-2 text-sm"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
            <span className="text-[var(--medi-text-secondary)]">
              (menor = más arriba)
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-10 flex-1 rounded-[var(--glass-radius-sm)] bg-green-600 px-3 py-1.5 text-sm font-semibold !text-white disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="glass-card-soft min-h-10 flex-1 rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] px-3 py-1.5 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="glass-card flex items-start justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--medi-text-primary)]">
            {category.title}
          </p>
          {!category.active && (
            <span className="glass-pill px-1.5 py-0.5 text-[10px] font-medium text-[var(--medi-text-secondary)]">
              inactiva
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--medi-text-secondary)]">
          {category.description}
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--medi-text-secondary)]">
          /{category.slug} · orden {category.sortOrder}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Switch
          checked={category.active}
          onCheckedChange={onToggle}
          aria-label={`Activar categoría ${category.title}`}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-medium text-[var(--medi-secondary)] hover:underline"
          >
            Editar
          </button>
          <span className="text-[var(--medi-border)]">·</span>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Eliminar
          </button>
        </div>
      </div>
    </li>
  )
}
