import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Download, Images } from 'lucide-react'
import { seoHead } from '#/lib/seo'

// ponytail: SSR (default) — catálogo estático de assets, compartible y barato
// de renderizar. Sin loader: la lista de archivos es una constante, no hay
// lectura de D1. Misma forma que /acerca-de y /equipo.
export const Route = createFileRoute('/medias')({
  head: () =>
    seoHead({
      title: 'Recursos gráficos',
      description:
        'Descarga el logotipo, los iconos de la app y los favicons de Psico Ayuda Venezuela. Archivos PNG y SVG listos para usar.',
      path: '/medias',
    }),
  component: MediasPage,
})

// ponytail: la lista de assets es estática (no se descubre del FS en runtime —
// en Workers no hay FS). Añadir un asset es un append aquí; el render es un
// .map. Si crece mucho, mover a un módulo de catálogo. Dimensiones/tamaños
// hardcodeados por archivo (filename convention + medición a fecha de commit).
type Swatch = 'light' | 'dark'

interface Asset {
  label: string
  file: string
  path: string
  format: 'PNG' | 'SVG' | 'ICO'
  dims: string
  size: string
  note?: string
  swatch: Swatch
}

interface Group {
  title: string
  description: string
  assets: Asset[]
}

const GROUPS: readonly Group[] = [
  {
    title: 'Logotipo',
    description:
      'Identidad principal de Psico Ayuda Venezuela. Usa la versión azul sobre fondos claros y la versión blanca sobre fondos oscuros o de color.',
    assets: [
      {
        label: 'Logo azul',
        file: 'logo-blue-psv-clean.png',
        path: '/psv/logo-blue-psv-clean.png',
        format: 'PNG',
        dims: '232 × 184',
        size: '9.9 KB',
        note: 'Para fondos claros',
        swatch: 'light',
      },
      {
        label: 'Logo azul (vector)',
        file: 'logo-blue-psv-clean.svg',
        path: '/psv/logo-blue-psv-clean.svg',
        format: 'SVG',
        dims: 'Vectorial',
        size: '4.4 KB',
        note: 'Escalable, para fondos claros',
        swatch: 'light',
      },
      {
        label: 'Logo blanco',
        file: 'logo-white-psv-clean.png',
        path: '/psv/logo-white-psv-clean.png',
        format: 'PNG',
        dims: '232 × 184',
        size: '9.3 KB',
        note: 'Para fondos oscuros o de color',
        swatch: 'dark',
      },
      {
        label: 'Logo blanco (vector)',
        file: 'logo-white-psv-clean.svg',
        path: '/psv/logo-white-psv-clean.svg',
        format: 'SVG',
        dims: 'Vectorial',
        size: '4.2 KB',
        note: 'Escalable, para fondos oscuros',
        swatch: 'dark',
      },
    ],
  },
  {
    title: 'Iconos de la app',
    description:
      'Iconos PWA y de instalación. El de 512 px sirve para previews sociales (OG/Twitter) y el maskable para la pantalla de inicio en Android.',
    assets: [
      {
        label: 'Icono 512',
        file: 'logo512.png',
        path: '/logo512.png',
        format: 'PNG',
        dims: '512 × 512',
        size: '112 KB',
        note: 'Preview social (OG/Twitter)',
        swatch: 'light',
      },
      {
        label: 'Icono 192',
        file: 'logo192.png',
        path: '/logo192.png',
        format: 'PNG',
        dims: '192 × 192',
        size: '38 KB',
        note: 'Pantalla de inicio PWA',
        swatch: 'light',
      },
      {
        label: 'Apple Touch Icon',
        file: 'apple-touch-icon.png',
        path: '/apple-touch-icon.png',
        format: 'PNG',
        dims: '180 × 180',
        size: '35 KB',
        note: 'Pantalla de inicio en iOS',
        swatch: 'light',
      },
      {
        label: 'Maskable 512',
        file: 'maskable-icon-512.png',
        path: '/maskable-icon-512.png',
        format: 'PNG',
        dims: '512 × 512',
        size: '90 KB',
        note: 'Icono adaptable Android',
        swatch: 'light',
      },
    ],
  },
  {
    title: 'Favicon',
    description:
      'Iconos de pestaña del navegador. El SVG es el nítido en pantallas HiDPI; el .ico es el fallback universal; el PNG de 32 px es para navegadores antiguos.',
    assets: [
      {
        label: 'Favicon (vector)',
        file: 'favicon.svg',
        path: '/favicon.svg',
        format: 'SVG',
        dims: 'Vectorial',
        size: '2.8 KB',
        note: 'HiDPI / moderno',
        swatch: 'light',
      },
      {
        label: 'Icono maskable (vector)',
        file: 'icon-maskable.svg',
        path: '/icon-maskable.svg',
        format: 'SVG',
        dims: 'Vectorial',
        size: '5.2 KB',
        note: 'Base vectorial maskable',
        swatch: 'light',
      },
      {
        label: 'Favicon 32',
        file: 'favicon-32.png',
        path: '/favicon-32.png',
        format: 'PNG',
        dims: '32 × 32',
        size: '4.1 KB',
        swatch: 'light',
      },
      {
        label: 'Favicon .ico',
        file: 'favicon.ico',
        path: '/favicon.ico',
        format: 'ICO',
        dims: '32 / 24 / 16',
        size: '7.7 KB',
        note: 'Fallback universal',
        swatch: 'light',
      },
    ],
  },
]

// ponytail: swatches fijos (no siguen el tema) porque representan la superficie
// real donde se usaría el asset (papel/pantalla). Light = #f5f7fb (papel),
// Dark = #0b1530 (mismo color que .prose pre). Predecible en light/dark mode.
const SWATCH_BG: Record<Swatch, string> = {
  light: '#f5f7fb',
  dark: '#0b1530',
}

function AssetCard({ asset }: { asset: Asset }) {
  return (
    <li className="glass-card flex flex-col p-4">
      <div
        aria-hidden="true"
        className="flex h-24 w-full items-center justify-center rounded-[var(--glass-radius-sm)] border border-[var(--glass-stroke)] p-3"
        style={{ backgroundColor: SWATCH_BG[asset.swatch] }}
      >
        <img
          src={asset.path}
          alt=""
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <span className="text-base font-semibold text-[var(--medi-text-primary)]">
          {asset.label}
        </span>
        <span className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[var(--medi-secondary)]">
          {asset.format} · {asset.dims} · {asset.size}
        </span>
        {asset.note && (
          <span className="mt-1 text-xs text-[var(--medi-text-secondary)]">
            {asset.note}
          </span>
        )}
      </div>
      <a
        href={asset.path}
        download={asset.file}
        className="glass-pill mt-3 inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <Download aria-hidden="true" className="size-4" />
        Descargar
      </a>
    </li>
  )
}

function MediasPage() {
  return (
    <main className="page-wrap page-wrap--wide flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Atrás
      </Link>

      <p className="section-kicker mt-6">Recursos gráficos</p>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        <Images
          aria-hidden="true"
          className="size-6 text-[var(--medi-secondary)]"
        />
        Descargas de marca
      </h1>
      <div className="section-underline mt-2" />

      <p className="mt-4 max-w-2xl text-sm text-[var(--medi-text-secondary)]">
        Logotipo, iconos de la app y favicons de Psico Ayuda Venezuela listos
        para descargar. Uso libre dentro del proyecto y de la red de apoyo.
        Preferimos el formato SVG cuando sea posible: escala sin perder
        calidad.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-lg font-semibold text-[var(--medi-text-primary)]">
              {group.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--medi-text-secondary)]">
              {group.description}
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.assets.map((asset) => (
                <AssetCard key={asset.path} asset={asset} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="glass-card-soft mt-10 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
        ¿Falta algún recurso?{' '}
        <Link
          to="/acerca-de"
          className="font-medium text-[var(--medi-secondary)] hover:underline"
        >
          Contáctanos
        </Link>
      </footer>
    </main>
  )
}
