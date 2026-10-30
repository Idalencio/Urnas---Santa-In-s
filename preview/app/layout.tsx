import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Santa Inês · Urna V2 · Testes',
  description: 'Teste privado da urna escolar, com alunos fictícios.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
