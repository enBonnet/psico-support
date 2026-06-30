import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCheck } from 'lucide-react'
import { seoHead } from '#/lib/seo'
import { CrisisBanner } from '#/components/crisis-banner'
import { ProCta } from '#/components/pro-cta'

// ponytail: CSR — step-through self-check widget, no crawler value.
export const Route = createFileRoute('/recursos/autochequeo')({
  ssr: false,
  head: () =>
    seoHead({
      title: 'Autochequeo emocional',
      description:
        'Un breve cuestionario para identificar cómo estás emocionalmente y si podrías necesitar apoyo profesional. No es un diagnóstico.',
      path: '/recursos/autochequeo',
    }),
  component: Autochequeo,
})

// ponytail: ASQ-derived, self-report adapted. The full ASQ is clinician-
// administered (4 items + acuity). 2 ideation items catch the safety-critical
// cases without over-burdening a self-check. Add items 3-4 (method/plan, prior
// behavior) only if a clinician advises it.
const GATE_ITEMS = [
  'En las últimas semanas, ¿has pensado que sería mejor estar muerto/a, o no despertar?',
  '¿Has tenido pensamientos de hacerte daño a ti mismo/a, o de quitarte la vida?',
] as const

// ponytail: K6 (Kessler-6), public domain, validated Spanish translation.
// Uses the standard 30-day window per original validation. For acute disaster
// triage, switch the reference to "últimas 2 semanas" — cutoff bands still
// approximately hold.
const K6_ITEMS = [
  { short: 'Nervioso/a', prompt: '¿Te sentiste nervioso/a?' },
  { short: 'Sin esperanza', prompt: '¿Te sentiste sin esperanza?' },
  { short: 'Inquieto/a', prompt: '¿Te sentiste inquieto/a o agitado/a?' },
  { short: 'Triste', prompt: '¿Te sentiste tan triste que nada podía animarte?' },
  { short: 'Esfuerzo', prompt: '¿Sentiste que todo te costaba mucho esfuerzo?' },
  { short: 'Sin valor', prompt: '¿Te sentiste sin valor (que no vales nada como persona)?' },
] as const

const K6_REFERENCE = 'Durante los últimos 30 días, ¿con qué frecuencia...'

const K6_SCALE = [
  { label: 'Nunca', value: 0 },
  { label: 'Rara vez', value: 1 },
  { label: 'Algunas veces', value: 2 },
  { label: 'La mayor parte del tiempo', value: 3 },
  { label: 'Todo el tiempo', value: 4 },
] as const

type Phase = 'intro' | 'gate' | 'k6' | 'result' | 'crisis'

interface Band {
  key: 'low' | 'moderate' | 'high'
  label: string
  blurb: string
  accent: string
}

function bandFor(score: number): Band {
  if (score <= 4)
    return {
      key: 'low',
      label: 'Bienestar general',
      blurb:
        'Tu puntaje sugiere un bajo nivel de malestar emocional. Las herramientas de autocuidado pueden ayudarte a mantener tu bienestar y a prevenir recaídas.',
      accent: 'var(--notif-success)',
    }
  if (score <= 12)
    return {
      key: 'moderate',
      label: 'Malestar moderado',
      blurb:
        'Tu puntaje sugiere un malestar moderado. Conviene prestar atención a cómo te sientes. Las herramientas de autocuidado pueden ayudar; si esto persiste o interfiere con tu vida diaria, considera hablar con un profesional.',
      accent: 'var(--notif-warning)',
    }
  return {
    key: 'high',
    label: 'Malestar alto',
    blurb:
      'Tu puntaje sugiere un nivel alto de malestar emocional. Te recomendamos hablar con un profesional lo antes posible. Pedir ayuda es un acto de cuidado.',
    accent: 'var(--notif-error)',
  }
}

function Autochequeo() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [gateIdx, setGateIdx] = useState(0)
  const [k6Idx, setK6Idx] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])

  // ponytail: total = gate + k6 questions; progress bar covers only the
  // questioning phases (intro/result show none).
  const TOTAL = GATE_ITEMS.length + K6_ITEMS.length
  const stepNo =
    phase === 'gate'
      ? gateIdx + 1
      : phase === 'k6'
        ? GATE_ITEMS.length + k6Idx + 1
        : TOTAL
  const progress = phase === 'intro' || phase === 'result' || phase === 'crisis' ? 0 : (stepNo / TOTAL) * 100

  const score = useMemo(() => answers.reduce((a, b) => a + b, 0), [answers])
  const band = bandFor(score)

  function gateAnswer(yes: boolean) {
    if (yes) {
      setPhase('crisis')
      return
    }
    if (gateIdx + 1 < GATE_ITEMS.length) setGateIdx((i) => i + 1)
    else setPhase('k6')
  }

  function k6Answer(value: number) {
    const next = [...answers]
    next[k6Idx] = value
    setAnswers(next)
    if (k6Idx + 1 < K6_ITEMS.length) setK6Idx((i) => i + 1)
    else setPhase('result')
  }

  function back() {
    if (phase === 'gate') {
      if (gateIdx === 0) setPhase('intro')
      else setGateIdx((i) => i - 1)
    } else if (phase === 'k6') {
      if (k6Idx === 0) {
        setPhase('gate')
        setGateIdx(GATE_ITEMS.length - 1)
      } else setK6Idx((i) => i - 1)
    }
  }

  function restart() {
    setPhase('intro')
    setGateIdx(0)
    setK6Idx(0)
    setAnswers([])
  }

  const showBack = phase === 'gate' || phase === 'k6'

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/recursos"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Autochequeo</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        ¿Cómo estoy?
      </h1>
      <div className="section-underline mt-2" />

      {phase !== 'intro' && phase !== 'crisis' && (
        <div className="mt-6" aria-hidden="true">
          <div className="flex justify-between text-xs font-medium text-[var(--medi-text-secondary)]">
            <span>
              {phase === 'result' ? 'Resultado' : `Pregunta ${stepNo} de ${TOTAL}`}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: 'rgba(19, 41, 126, 0.1)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: 'var(--medi-secondary)' }}
            />
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="glass-card mt-6 p-5">
          <div className="flex items-start gap-3">
            <ClipboardCheck
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0 text-[var(--medi-secondary)]"
            />
            <div>
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                Este autochequeo te ayuda a reflexionar sobre cómo te has sentido
                últimamente. Son pocas preguntas y tus respuestas{' '}
                <strong className="text-[var(--medi-text-primary)]">
                  se quedan en tu dispositivo
                </strong>
                : no se guardan ni se envían.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                Primero te preguntaremos si necesitas apoyo urgente. Luego, 6
                preguntas sobre tu bienestar de las últimas semanas.
              </p>
              <p className="mt-3 rounded-[var(--glass-radius-sm)] border-l-4 border-[var(--medi-secondary)] bg-[rgba(23,140,239,0.06)] p-3 text-xs text-[var(--medi-text-secondary)]">
                Esto es un autochequeo educativo y <strong>no sustituye un
                diagnóstico profesional</strong>. Si te preocupa tu bienestar,
                habla con un psicólogo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPhase('gate')}
            className="glass-primary mt-5 flex min-h-12 w-full items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            Empezar
          </button>
        </div>
      )}

      {phase === 'gate' && (
        <div className="glass-card mt-6 p-5">
          <p className="text-lg font-medium leading-relaxed text-[var(--medi-text-primary)]">
            {GATE_ITEMS[gateIdx]}
          </p>
          <p className="mt-3 text-xs text-[var(--medi-text-secondary)]">
            Responde con sinceridad. Si la respuesta es sí, te mostraremos cómo
            obtener ayuda ahora mismo.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => gateAnswer(false)}
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => gateAnswer(true)}
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              Sí
            </button>
          </div>
        </div>
      )}

      {phase === 'k6' && (
        <div className="glass-card mt-6 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--medi-text-secondary)]">
            {K6_REFERENCE}
          </p>
          <p className="mt-2 text-lg font-medium leading-relaxed text-[var(--medi-text-primary)]">
            {K6_ITEMS[k6Idx].prompt}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {K6_SCALE.map(({ label, value }) => {
              const selected = answers[k6Idx] === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => k6Answer(value)}
                  className={
                    selected
                      ? 'flex min-h-11 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-2 text-sm font-semibold text-white transition-all'
                      : 'glass-card-soft flex min-h-11 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-2 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]'
                  }
                  style={selected ? { backgroundColor: 'var(--medi-secondary)' } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="mt-6 flex flex-col gap-4">
          <div
            className="glass-card p-5"
            style={{ borderLeft: `4px solid ${band.accent}` }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--medi-text-secondary)]">
              Tu puntaje: {score} de 24
            </p>
            <p
              className="mt-1 text-xl font-bold"
              style={{ color: band.accent }}
            >
              {band.label}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
              {band.blurb}
            </p>
            <p className="mt-4 rounded-[var(--glass-radius-sm)] bg-[rgba(19,41,126,0.05)] p-3 text-xs text-[var(--medi-text-secondary)]">
              Esto es un autochequeo educativo, no un diagnóstico clínico. Solo
              un profesional puede evaluar tu situación en detalle.
            </p>
          </div>

          {band.key === 'low' && (
            <Link
              to="/recursos"
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              Ver herramientas de autocuidado
            </Link>
          )}
          {band.key !== 'low' && <ProCta />}

          <button
            type="button"
            onClick={restart}
            className="text-sm font-medium text-[var(--medi-secondary)] underline"
          >
            Hacer el autochequeo de nuevo
          </button>
        </div>
      )}

      {phase === 'crisis' && (
        <div className="mt-6 flex flex-col gap-4">
          <div
            className="glass-card flex items-start gap-3 p-5"
            style={{ borderLeft: '4px solid var(--notif-error)' }}
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0"
              style={{ color: 'var(--notif-error)' }}
            />
            <div>
              <p className="text-lg font-bold text-[var(--medi-text-primary)]">
                Gracias por responder con sinceridad
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                Por lo que compartiste, es importante que hables con alguien ahora
                mismo. No estás solo/a. Hablar con un profesional puede ayudarte a
                estar más seguro/a y encontrar apoyo.
              </p>
            </div>
          </div>

          <ProCta />

          <Link
            to="/recursos/reacciones-normales"
            className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-3 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
          >
            Leer sobre reacciones tras una crisis
          </Link>

          <button
            type="button"
            onClick={restart}
            className="text-sm font-medium text-[var(--medi-secondary)] underline"
          >
            Volver al inicio
          </button>
        </div>
      )}

      {showBack && (
        <button
          type="button"
          onClick={back}
          className="mt-3 self-start py-2 text-sm font-medium text-[var(--medi-secondary)]"
        >
          ‹ Anterior
        </button>
      )}

      {/* Safety net: always reachable, on every phase. */}
      <div className="mt-8">
        <CrisisBanner />
      </div>
    </main>
  )
}
