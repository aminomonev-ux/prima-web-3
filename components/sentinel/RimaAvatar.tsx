'use client'

// components/sentinel/RimaAvatar.tsx — maskot RIMA, pure SVG tanpa asset raster
// (CONCEPT-sentinel-bot.md §3): chibi 3D-look — bodi putih glossy (cel-shading
// berlapis), visor gelap, mata cincin menyala (currentColor), antena ganda,
// ear pods, logo P amber di dada. Animasi murni CSS keyframes .rima-* di
// globals.css (pola rule global prima-del-top) — GPU compositor, CPU idle ~0%.

export type RimaState   = 'ok' | 'warning' | 'critical' | 'talk'
export type RimaGesture = 'idle' | 'point-left' | 'point-right' | 'point-up' | 'wave' | 'wave-l' | 'cheer' | 'hop' | 'stretch' | 'think'
// Reaksi chat (A1): angguk = jawaban yakin · geleng halus = fallback. Channel
// terpisah dari gesture (lengan) supaya tak bentrok think/idle saat memproses.
export type RimaReaction = 'nod' | 'shake'

const STATE_COLOR: Record<RimaState, string> = {
  ok:       '#1D9E75',
  warning:  '#EF9F27',
  critical: '#E24B4A',
  talk:     '#EF9F27',
}

export default function RimaAvatar({
  state = 'ok',
  gesture = 'idle',
  reaction = null,
  talking = false,
  sleeping = false,
  dozing = false,
  size = 64,
}: {
  state?:   RimaState
  gesture?: RimaGesture
  /** A1: angguk/geleng singkat pasca-jawaban chat — dikelola SentinelBot (timer). */
  reaction?: RimaReaction | null
  talking?: boolean
  /** F4d: tidur nyenyak — rebah di kasur (page-idle lama). Mata terpejam + zzz + kasur. */
  sleeping?: boolean
  /** F4d: ngantuk sebentar — Zzz berdiri (chat-idle), TANPA kasur. Loop bangun→nyeletuk. */
  dozing?: boolean
  size?:    number
}) {
  const isTalking  = talking || state === 'talk'
  const isResting  = sleeping || dozing
  // gesture 'think' (chat memproses) → mata menyipit + titik pikir; state critical
  // (entri ganda PASTI) → sentakan perhatian. Istirahat (doze/tidur) menonaktifkan keduanya.
  const isThinking = gesture === 'think' && !isResting
  const isAlert    = state === 'critical' && !isResting
  return (
    <svg
      viewBox="0 0 120 150"
      width={size}
      height={Math.round(size * 1.25)}
      xmlns="http://www.w3.org/2000/svg"
      className={`rima-avatar rima-g-${gesture}${isTalking ? ' rima-talking' : ''}${sleeping ? ' rima-sleeping' : dozing ? ' rima-dozing' : ''}${isThinking ? ' rima-thinking' : ''}${isAlert ? ' rima-alert' : ''}${reaction && !isResting ? ` rima-react-${reaction}` : ''}`}
      style={{ color: STATE_COLOR[state] }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rimaBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".72" stopColor="#EDF2F8" />
          <stop offset="1" stopColor="#CBD8E4" />
        </linearGradient>
        <radialGradient id="rimaVisor" cx=".5" cy=".3" r="1">
          <stop offset="0" stopColor="#11304E" />
          <stop offset="1" stopColor="#020F1C" />
        </radialGradient>
        {/* Roket lepas landas (drag): api berlapis + bell nozzle metalik — token DESIGN-SYSTEM */}
        <linearGradient id="rimaFlameOuter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD27A" />
          <stop offset=".4" stopColor="#EF9F27" />
          <stop offset=".75" stopColor="#E24B4A" />
          <stop offset="1" stopColor="#E24B4A" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rimaFlameInner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".5" stopColor="#BFE0FF" />
          <stop offset="1" stopColor="#7FB6F0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rimaNozzle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#AFC2D4" />
          <stop offset="1" stopColor="#5E6E7E" />
        </linearGradient>
      </defs>

      <ellipse className="rima-shadow" cx="60" cy="144" rx="25" ry="4.5" fill="#000" opacity=".22" />

      {/* F4d tidur: kasur + bantal muncul saat .rima-sleeping (badan diputar rebah di
         atasnya via CSS). Statik di belakang badan — opacity 0 saat tidak tidur.
         Warna dari token DESIGN-SYSTEM (canvas-dark/surface-card + alpha amber/teks). */}
      <g className="rima-bed" aria-hidden="true">
        {/* kaki ranjang */}
        <rect x="11" y="136" width="6" height="11" rx="2" fill="#BA7517" />
        <rect x="103" y="136" width="6" height="11" rx="2" fill="#BA7517" />
        {/* rangka kayu (rail bawah) */}
        <rect x="7" y="128" width="106" height="10" rx="3" fill="#BA7517" />
        {/* sandaran kepala (kiri, tinggi) + papan kaki (kanan, pendek) */}
        <rect x="6" y="98" width="11" height="40" rx="4" fill="#BA7517" />
        <rect x="103" y="114" width="11" height="24" rx="4" fill="#BA7517" />
        {/* kasur/seprai */}
        <rect x="14" y="116" width="91" height="14" rx="5" fill="#042C53" stroke="rgba(230,241,251,.3)" strokeWidth="1" />
        <rect x="14" y="116" width="91" height="5" rx="3" fill="rgba(230,241,251,.16)" />
        {/* bantal (kiri, dekat sandaran) */}
        <rect x="19" y="107" width="28" height="14" rx="6" fill="#CBD8E4" stroke="rgba(2,15,28,.25)" strokeWidth="1" />
      </g>

      <g className="rima-float">
        {/* Antena ganda */}
        <g className="rima-antena">
          <line x1="44" y1="16" x2="40" y2="6" stroke="#9FB3C8" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="39.5" cy="5" r="3.4" fill="currentColor" className="rima-glow-dot" />
        </g>
        <g className="rima-antena rima-antena-r">
          <line x1="76" y1="16" x2="80" y2="6" stroke="#9FB3C8" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="80.5" cy="5" r="3.4" fill="currentColor" className="rima-glow-dot" />
        </g>

        {/* Roket "lepas landas" (drag F4) — kaki & tangan jadi nozzle ber-api + boost
           pusat. Tampil/animasi di-drive lewat kelas .rima-flying / .rima-boosting di
           .rima-pose (ancestor) — di sini selalu dirender tapi opacity 0 saat diam.
           Ditaruh sebelum lengan/badan/kaki supaya nozzle "menempel" di balik anggota. */}
        <g className="rima-thrust" aria-hidden="true">
          {/* Api (di belakang nozzle) */}
          <g className="rima-flame-g rima-flame-boost">
            <path className="rima-flame" d="M49 128 Q43 158 60 188 Q77 158 71 128 Z" fill="url(#rimaFlameOuter)" />
            <path className="rima-flame" d="M53 130 Q49 154 60 176 Q71 154 67 130 Z" fill="url(#rimaFlameInner)" />
          </g>
          <g className="rima-flame-g rima-flame-foot-l">
            <path className="rima-flame" d="M44 131 Q41 150 48.5 168 Q56 150 53 131 Z" fill="url(#rimaFlameOuter)" />
            <path className="rima-flame" d="M46 132 Q44.5 146 48.5 159 Q52.5 146 51 132 Z" fill="url(#rimaFlameInner)" />
          </g>
          <g className="rima-flame-g rima-flame-foot-r">
            <path className="rima-flame" d="M67 131 Q64 150 71.5 168 Q79 150 76 131 Z" fill="url(#rimaFlameOuter)" />
            <path className="rima-flame" d="M69 132 Q67.5 146 71.5 159 Q75.5 146 74 132 Z" fill="url(#rimaFlameInner)" />
          </g>
          <g className="rima-flame-g rima-flame-hand-l">
            <path className="rima-flame" d="M20.5 114 Q18 132 24.5 150 Q31 132 28.5 114 Z" fill="url(#rimaFlameOuter)" />
            <path className="rima-flame" d="M22 115 Q20.5 129 24.5 141 Q28.5 129 27 115 Z" fill="url(#rimaFlameInner)" />
          </g>
          <g className="rima-flame-g rima-flame-hand-r">
            <path className="rima-flame" d="M91.5 114 Q89 132 95.5 150 Q102 132 99.5 114 Z" fill="url(#rimaFlameOuter)" />
            <path className="rima-flame" d="M93 115 Q91.5 129 95.5 141 Q99.5 129 98 115 Z" fill="url(#rimaFlameInner)" />
          </g>
          {/* Bell nozzle metalik */}
          <g className="rima-nozzle">
            <path d="M51 110 L69 110 L73 128 L47 128 Z" fill="url(#rimaNozzle)" stroke="#4A5965" strokeWidth="1" />
            <ellipse cx="60" cy="128" rx="12" ry="3.2" fill="#34404A" />
            <path d="M45 116 L52 116 L55 131 L42 131 Z" fill="url(#rimaNozzle)" stroke="#4A5965" strokeWidth="1" />
            <ellipse cx="48.5" cy="131" rx="6.5" ry="2.2" fill="#34404A" />
            <path d="M68 116 L75 116 L78 131 L65 131 Z" fill="url(#rimaNozzle)" stroke="#4A5965" strokeWidth="1" />
            <ellipse cx="71.5" cy="131" rx="6.5" ry="2.2" fill="#34404A" />
            <path d="M21 104 L28 104 L30 114 L19 114 Z" fill="url(#rimaNozzle)" stroke="#4A5965" strokeWidth="1" />
            <ellipse cx="24.5" cy="114" rx="5.5" ry="2" fill="#34404A" />
            <path d="M92 104 L99 104 L101 114 L90 114 Z" fill="url(#rimaNozzle)" stroke="#4A5965" strokeWidth="1" />
            <ellipse cx="95.5" cy="114" rx="5.5" ry="2" fill="#34404A" />
          </g>
        </g>

        {/* Lengan kiri (kiri layar) */}
        <g className="rima-arm rima-arm-l">
          <rect x="19" y="80" width="11" height="27" rx="5.5" fill="url(#rimaBody)" stroke="#AFC2D4" strokeWidth="1" />
          <circle className="rima-hand" cx="24.5" cy="108" r="5" fill="#E6EDF5" stroke="#AFC2D4" strokeWidth="1" />
          <rect className="rima-finger" x="12" y="104" width="11" height="5" rx="2.5" fill="#E6EDF5" stroke="#AFC2D4" strokeWidth="1" />
        </g>
        {/* Lengan kanan (kanan layar) */}
        <g className="rima-arm rima-arm-r">
          <rect x="90" y="80" width="11" height="27" rx="5.5" fill="url(#rimaBody)" stroke="#AFC2D4" strokeWidth="1" />
          <circle className="rima-hand" cx="95.5" cy="108" r="5" fill="#E6EDF5" stroke="#AFC2D4" strokeWidth="1" />
          <rect className="rima-finger" x="97" y="104" width="11" height="5" rx="2.5" fill="#E6EDF5" stroke="#AFC2D4" strokeWidth="1" />
        </g>

        {/* Badan */}
        <rect x="33" y="74" width="54" height="45" rx="17" fill="url(#rimaBody)" stroke="#AFC2D4" strokeWidth="1" />
        {/* Highlight glossy badan */}
        <rect x="39" y="78" width="14" height="22" rx="7" fill="#FFFFFF" opacity=".65" />
        {/* Logo P amber di dada */}
        <circle cx="60" cy="97" r="10.5" fill="#EF9F27" />
        <text x="60" y="101.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFFFFF" fontFamily="Inter, sans-serif">P</text>

        {/* Kaki */}
        <rect className="rima-foot" x="42" y="118" width="13" height="11" rx="5.5" fill="#D5DFE9" stroke="#AFC2D4" strokeWidth="1" />
        <rect className="rima-foot" x="65" y="118" width="13" height="11" rx="5.5" fill="#D5DFE9" stroke="#AFC2D4" strokeWidth="1" />

        {/* Kepala */}
        <rect x="17" y="14" width="86" height="58" rx="27" fill="url(#rimaBody)" stroke="#AFC2D4" strokeWidth="1" />
        {/* Highlight glossy kepala */}
        <ellipse cx="40" cy="25" rx="16" ry="7" fill="#FFFFFF" opacity=".75" />
        {/* Ear pods */}
        <circle cx="15" cy="43" r="6.5" fill="#C3CFDB" stroke="#AFC2D4" strokeWidth="1" />
        <circle cx="105" cy="43" r="6.5" fill="#C3CFDB" stroke="#AFC2D4" strokeWidth="1" />
        {/* Visor gelap */}
        <rect x="27" y="25" width="66" height="37" rx="18.5" fill="url(#rimaVisor)" />
        {/* Mata cincin menyala */}
        <circle className="rima-glow" cx="46" cy="42" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity=".3" />
        <circle className="rima-glow" cx="74" cy="42" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity=".3" />
        <circle className="rima-eye" cx="46" cy="42" r="6" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle className="rima-eye" cx="74" cy="42" r="6" fill="none" stroke="currentColor" strokeWidth="3" />
        {/* Mulut — denyut saat bicara */}
        <rect className="rima-mouth" x="54" y="52" width="12" height="3.5" rx="1.75" fill="currentColor" />
        {/* Titik pikir — hanya saat thinking (chat memproses) */}
        <g className="rima-think-dots">
          <circle className="rima-think-dot rima-think-dot-1" cx="92" cy="16" r="2.2" fill="#9FB3C8" />
          <circle className="rima-think-dot rima-think-dot-2" cx="99" cy="10" r="2.8" fill="#9FB3C8" />
          <circle className="rima-think-dot rima-think-dot-3" cx="107" cy="6" r="3.4" fill="#9FB3C8" />
        </g>
        {/* Zzz — hanya tampil saat sleeping (F4b ambient) */}
        <g className="rima-zzz">
          <text className="rima-zzz-1" x="98" y="20" fontSize="13" fontWeight="800" fill="#9FB3C8" fontFamily="Inter, sans-serif">z</text>
          <text className="rima-zzz-2" x="106" y="11" fontSize="9" fontWeight="800" fill="#9FB3C8" fontFamily="Inter, sans-serif">z</text>
        </g>
      </g>

      {/* Selimut — di depan badan, menutup torso→kaki (kanan); kepala di bantal (kiri) terbuka. */}
      <g className="rima-blanket" aria-hidden="true">
        <rect x="49" y="113" width="61" height="20" rx="7" fill="rgba(239,159,39,.2)" stroke="rgba(239,159,39,.5)" strokeWidth="1" />
        <rect x="49" y="113" width="61" height="6" rx="3" fill="rgba(230,241,251,.18)" />
      </g>
    </svg>
  )
}
