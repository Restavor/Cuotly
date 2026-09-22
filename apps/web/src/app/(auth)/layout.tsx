/**
 * El grupo `(auth)` ya no pone marco propio: entrar y poner la contraseña
 * usan `AuthCard`, y la solicitud de acceso y los estados de acceso usan
 * `AccessShell` (F01, A01 a A12). Cada pantalla elige el suyo.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
