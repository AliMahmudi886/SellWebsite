import type { PoolClient } from "pg";

export async function recordAdminAudit(
  client: PoolClient,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  await client.query(
    "INSERT INTO admin_audit_log(actor,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [actor, action, targetType, targetId, JSON.stringify(details)],
  );
}
