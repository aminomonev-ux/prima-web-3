// crypto.randomUUID() hanya jalan di secure context (HTTPS / localhost).
// Di intranet HTTP + IP (mis. http://10.24.100.240:3000) bernilai undefined
// → form crash. Helper ini pakai crypto.getRandomValues() yang tersedia
// di semua context (HTTP/HTTPS) dan tetap kriptografis kuat.

export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* fallthrough */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
}
