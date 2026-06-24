import type { CSSProperties } from 'react'

export const cellNum: CSSProperties = {
  padding: '6px 8px', textAlign: 'center',
  color: '#85B7EB', fontWeight: 600,
  background: 'rgba(12,68,124,.20)',
  border: '1px solid rgba(255,255,255,.06)',
}

export const cellSampleHead: CSSProperties = {
  padding: '6px 8px',
  fontWeight: 700, color: '#EF9F27',
  background: 'rgba(239,159,39,.10)',
  border: '1px solid rgba(255,255,255,.06)',
}

export const cellSample: CSSProperties = {
  padding: '6px 8px',
  color: '#E6F1FB',
  background: 'rgba(12,68,124,.10)',
  border: '1px solid rgba(255,255,255,.06)',
}

export function pagerBtn(disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    background: 'transparent', border: '1px solid #185FA5', color: disabled ? '#85B7EB' : '#B5D4F4',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .35 : 1,
    transition: 'all .15s',
  }
}
