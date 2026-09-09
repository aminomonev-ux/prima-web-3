
import { NextResponse } from 'next/server';
import { getSession, createToken, setSessionCookie } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { sql } from '@/lib/data/db';
import type { SessionPayload } from '@/types';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Session expired' }, { status: 401 });
  }
  // SDL-M17: rate-limit heartbeat. Client normal ~1/menit, beri budget 30/menit
  // untuk multi-tab/burst. Tanpa ini, attacker dengan stolen JWT bisa hammer
  // endpoint → contention UPDATE user_sessions.last_active.
  const rl = await checkRateLimit(`keepalive:${session.userId}`, 30, 60);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
  }
  // T-2 (Tahap 1/A2): peran dibaca SEGAR dari DB, tidak diteruskan dari payload lama.
  // Sebelum ini `createToken(session, …)` menandatangani ulang isi token apa adanya,
  // jadi peran yang sudah diubah admin ikut diperpanjang terus selama orangnya masih
  // membuka aplikasi — batas nyatanya sampai akhir hari kerja (token 8 jam / idle 60
  // menit / laptop server dimatikan tiap malam), bukan 7 hari seperti dikira semula.
  //
  // Menumpang kueri yang SUDAH ada lewat JOIN, bukan kueri kedua — dan sengaja di sini,
  // bukan di `getSession()`: yang terakhir God Node yang jalan di setiap route, sementara
  // keepalive jalan ~1 menit sekali per orang. Itu yang membuat harganya nol.
  //
  // Peran berganti TIDAK mengusir siapa pun (keputusan §9-2): sesinya tetap hidup, cuma
  // isi tokennya yang disegarkan. Kalau peran barunya tak berhak atas halaman yang sedang
  // dibuka, `proxy.ts` memulangkannya ke /menu — bukan ke /login.
  // JANGAN diganti `s.role`. `user_sessions` punya kolomnya sendiri, dan ia terlihat
  // seperti jawaban yang lebih murah — padahal isinya peran SAAT SESI DIBUAT, yaitu
  // persis nilai basi yang perbaikan ini hendak dibuang. Yang benar `users.role`.
  let peranSegar: string | null = null;

  if (session.sessionId) {
    let rows: { role: string }[] = [];
    try {
      rows = await sql`
        SELECT u.role
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_id = ${session.sessionId} AND s.invalidated_at IS NULL
        LIMIT 1
      ` as { role: string }[];
    } catch { rows = []; }
    // Gagal baca DB tetap dijawab 401, sama seperti sebelum A2. Kueri ini menjawab DUA
    // hal sekaligus — "sesinya masih sah?" dan "perannya apa sekarang?" — dan yang
    // pertama fail-closed sejak awal. Melonggarkannya jadi "kalau DB error, perpanjang
    // saja" akan membuat sesi yang SUDAH dicabut bertahan hidup setiap kali MySQL
    // tersendat. Yang boleh fail-soft cuma perannya (di bawah).
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: 'Session revoked' }, { status: 401 });
    }
    peranSegar = rows[0]?.role ?? null;
    try {
      await sql`UPDATE user_sessions SET last_active = NOW() WHERE session_id = ${session.sessionId}`;
    } catch { /* silent */ }
  }

  // SEC-W3: `session` sudah mengandung `originalIat` (atau fallback ke `iat`
  // untuk token legacy via getSession). createToken meneruskannya tanpa
  // reset → clock absolute lifetime tetap valid.
  //
  // Token legacy tanpa `sessionId` tidak melewati kueri di atas, jadi `peranSegar`
  // tetap null dan perannya dipakai apa adanya — persis perilaku lama. Sengaja tidak
  // ditambah kueri sendiri untuk kasus itu: jalur legacy akan habis sendiri dalam
  // 7 hari (batas mutlak sesi), dan menambah kueri untuknya berarti memelihara jalur
  // yang sedang menuju mati.
  const payload = peranSegar ? { ...session, role: peranSegar as SessionPayload['role'] } : session;
  const newToken = await createToken(payload, session.sessionId);
  await setSessionCookie(newToken);
  return NextResponse.json({ ok: true });
}
