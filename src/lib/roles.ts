import type { UserRoleStrict } from '@/types/database';

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin';
}

export function isEnterprise(role: string | null | undefined): boolean {
  return role === 'enterprise';
}

export function isManager(role: string | null | undefined): boolean {
  return role === 'manager';
}

export function isSelectora(role: string | null | undefined): boolean {
  return role === 'selectora';
}

export function isCliente(role: string | null | undefined): boolean {
  return role === 'cliente';
}

export function isSupport(role: string | null | undefined): boolean {
  return role === 'support';
}

// Roles que ven la data del equipo (postulantes, vacancies, etc.) sin filtro de cliente.
export function isTeamRole(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'enterprise' || role === 'manager' || role === 'selectora';
}

// Roles que pueden gestionar usuarios de su organizacion.
export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'enterprise' || role === 'manager';
}

// Roles que pueden gestionar configuracion de su organizacion (etapas, rubricas, etc.)
export function canManageOrg(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'enterprise' || role === 'manager';
}

// Roles que solo el super_admin puede asignar.
// Nota: 'support' NO esta en la lista a proposito. Es un rol interno de
// Dale Automations (mesa de soporte que atiende tickets de todas las orgs).
// Se crea manualmente desde el SQL Editor o via curl directo a la edge
// function, no desde el dropdown de "Crear usuario". Si lo agregamos aca,
// cualquier super_admin de un cliente (Vicky, Nacho, etc.) podria crear
// users 'support' que veria todos los tickets cross-org.
export const ROLES_FOR_SUPER_ADMIN: UserRoleStrict[] = ['enterprise', 'manager', 'selectora', 'cliente'];
export const ROLES_FOR_ENTERPRISE_OR_MANAGER: UserRoleStrict[] = ['manager', 'selectora', 'cliente'];

/**
 * Roles que el caller puede asignar al crear usuarios.
 *
 * - super_admin: todos los roles (excepto super_admin).
 * - enterprise/manager: manager/selectora; agrega 'cliente' SOLO si la org tiene
 *   clientes externos (caso dale-accelrh). En orgs nuevas tipo demo no hay cliente.
 */
export function rolesAssignableBy(
  callerRole: string | null | undefined,
  orgHasExternalClients: boolean = true,
): UserRoleStrict[] {
  if (callerRole === 'super_admin') return ROLES_FOR_SUPER_ADMIN;
  if (callerRole === 'enterprise' || callerRole === 'manager') {
    return orgHasExternalClients
      ? ROLES_FOR_ENTERPRISE_OR_MANAGER
      : (['manager', 'selectora'] as UserRoleStrict[]);
  }
  return [];
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin': return 'Super admin';
    case 'enterprise': return 'Enterprise';
    case 'manager': return 'Manager';
    case 'selectora': return 'Selectora';
    case 'cliente': return 'Cliente';
    case 'support': return 'Soporte';
    default: return role || '-';
  }
}
