import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/geist-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRIMA — RSJD Dr. Amino Gondohutomo",
  description: "Program Realisasi Informasi Monitoring Anggaran",
  robots: "noindex, nofollow", 
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Baca cookie prima_theme di server — set data-theme langsung di HTML SSR.
  // Cara ini eliminate FOCT (Flash Of Wrong Theme) saat reload, karena
  // HTML yang sampai ke browser sudah punya atribut data-theme yang benar
  // sebelum CSS dirender. Tidak perlu nunggu script client-side jalan.
  const cookieStore = await cookies();
  const theme = cookieStore.get('prima_theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html
      lang="id"
      data-theme={theme}
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
