// Supabase keeps a technical email identifier; users only enter their username.
// .invalid is reserved and cannot route mail to an unrelated domain.
export function loginAddress(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw new Error(
      "Use de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado. Comece com uma letra.",
    );
  }
  return `${normalized}@techvendas.invalid`;
}
