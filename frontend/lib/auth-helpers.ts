/**
 * DentFlowAi - Auth Role Helpers
 * 
 * El rol 'admin' es super-usuario: puede actuar como cualquier rol.
 * Usa estas funciones en server actions y UI para chequeos de rol consistentes.
 */

/**
 * Verifica si un rol tiene acceso como técnico.
 * Admin puede actuar como técnico para pruebas.
 */
export function canActAsTecnico(role: string | undefined | null): boolean {
  return role === 'tecnico' || role === 'admin';
}

/**
 * Verifica si un rol tiene acceso como dentista.
 * Admin puede actuar como dentista para pruebas.
 */
export function canActAsDentista(role: string | undefined | null): boolean {
  return role === 'dentista' || role === 'admin';
}

