


import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { generateNoUsulan } from '@/lib/data/usulan';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const subBidang = req.nextUrl.searchParams.get('sub_bidang') ?? '';
    const tahunStr  = req.nextUrl.searchParams.get('tahun') ?? '';
    const jenis     = req.nextUrl.searchParams.get('jenis') ?? 'MURNI';
    if (!subBidang) return NextResponse.json({ ok: false, message: 'sub_bidang wajib' }, { status: 400 });

    const tahun = tahunStr ? parseInt(tahunStr) : undefined;
    const noUsulan = await generateNoUsulan(subBidang, tahun, jenis);
    return NextResponse.json({ ok: true, no_usulan: noUsulan });
  } catch (error) {
    console.error('[Preview No Error]', error);
    return NextResponse.json({ ok: false, message: 'Server error' }, { status: 500 });
  }
}
