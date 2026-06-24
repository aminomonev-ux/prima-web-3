import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RencanaAksiLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  if (!h.get('x-user-id')) redirect('/login');
  return <>{children}</>;
}
