'use client'
// components/blud/TautanMenu.tsx — tautan ke menu LAIN yang bisa saja tertutup.
//
// Beberapa layar menunjuk menu lain di dalam kalimatnya ("susun DPA lebih dulu di
// menu DPA BLUD"). Kalau menu tujuannya `TIDAK` bagi orang itu, tautannya turun jadi
// teks tebal biasa: mengarahkan orang ke pintu yang akan melemparnya balik lebih
// membingungkan daripada tidak menawarkan pintunya sama sekali. Kalimatnya tetap
// utuh — nasihatnya masih benar, cuma bukan dia yang mengerjakannya.

export default function TautanMenu({ href, boleh, children }: {
  href: string
  boleh: boolean
  children: React.ReactNode
}) {
  if (!boleh) return <b>{children}</b>
  return <a href={href} className="blud-imp-link">{children}</a>
}
