/**
 * Validación mínima compartida por las pantallas de login y registro.
 * Separada del componente para poder probarla sin depender del renderizado
 * de React Native (ver nota en docs/PLAN-H1-H2.md sobre @testing-library/react-native).
 */
export function validateCredentials(
  email: string,
  password: string,
): string | null {
  if (!email || !password) {
    return "Rellena correo y contraseña.";
  }
  return null;
}
