import type { CSSProperties } from 'react'

export const pkInputTable: CSSProperties = {
  width: '100%', background: 'rgba(2,15,28,.45)',
  border: '1px solid rgba(24,95,165,.4)', borderRadius: 6,
  padding: '6px 10px', color: '#E6F1FB', fontSize: 12.5,
  fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s',
}

export const pkInputForm: CSSProperties = {
  width: '100%', background: 'rgba(2,15,28,.45)',
  border: '1px solid rgba(24,95,165,.4)', borderRadius: 6,
  padding: '8px 12px', color: '#E6F1FB', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s',
}

export const pkMono: CSSProperties = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  padding: '1px 5px', borderRadius: 3,
  background: 'rgba(12,68,124,.5)', color: '#FAC775', fontSize: 10.5,
}

export const pkCheckbox: CSSProperties = {
  width: 16, height: 16, cursor: 'pointer', accentColor: '#EF9F27',
}

export const pkModalBackdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(2,15,28,.78)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
}

export const pkBadge: CSSProperties = {
  marginTop: 6, padding: '6px 10px', borderRadius: 6,
  fontSize: 11, fontWeight: 600, lineHeight: 1.5,
  border: '1px solid', display: 'flex', alignItems: 'center', gap: 6,
}
