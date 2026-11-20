export const adminPermissions = [
  "orders:read", "orders:write", "catalog:read", "catalog:write", "media:write", "audit:read",
] as const;

export type AdminPermission = typeof adminPermissions[number];

export function permissionsFor(role: string | undefined): readonly AdminPermission[] {
  switch (role ?? "owner") {
    case "owner": return adminPermissions;
    case "support": return ["orders:read", "orders:write"];
    case "catalog": return ["catalog:read", "catalog:write", "media:write"];
    case "auditor": return ["audit:read"];
    default: return [];
  }
}
