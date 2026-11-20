export async function readOutboxStatus(pool) {
  const { rows: [status] } = await pool.query(`
    SELECT
      count(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL AND next_attempt_at <= now()) AS ready,
      count(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL AND next_attempt_at > now()) AS delayed,
      count(*) FILTER (WHERE published_at IS NULL AND failed_at IS NOT NULL) AS failed,
      count(*) FILTER (WHERE published_at IS NOT NULL) AS delivered,
      extract(epoch FROM now() - min(created_at) FILTER (
        WHERE published_at IS NULL AND failed_at IS NULL
      ))::double precision AS oldest_pending_seconds
      ,extract(epoch FROM now() - min(next_attempt_at) FILTER (
        WHERE published_at IS NULL AND failed_at IS NULL AND next_attempt_at <= now()
      ))::double precision AS oldest_ready_seconds
    FROM order_outbox
  `);
  const { rows: failures } = await pool.query(`
    SELECT id, event_type, delivery_attempts, failed_at
    FROM order_outbox WHERE published_at IS NULL AND failed_at IS NOT NULL
    ORDER BY failed_at DESC, id LIMIT 20
  `);
  return { ...status, recent_failures: failures };
}

export async function requeueFailedOutboxEvent(pool, eventId) {
  if (typeof eventId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(eventId)) {
    throw new Error("A valid event UUID is required.");
  }
  const result = await pool.query(`
    UPDATE order_outbox SET delivery_attempts=0, next_attempt_at=now(), failed_at=NULL
    WHERE id=$1 AND failed_at IS NOT NULL AND published_at IS NULL
  `, [eventId]);
  return result.rowCount === 1;
}

export function outboxHealth(status, maxReadyAgeSeconds) {
  const reasons = [];
  if (Number(status.failed) > 0) reasons.push("terminal_failures");
  if (status.oldest_ready_seconds !== null && status.oldest_ready_seconds >= maxReadyAgeSeconds) {
    reasons.push("ready_backlog_overdue");
  }
  return {
    healthy: reasons.length === 0,
    reasons,
    max_ready_age_seconds: maxReadyAgeSeconds,
    ready: status.ready,
    delayed: status.delayed,
    failed: status.failed,
    oldest_ready_seconds: status.oldest_ready_seconds,
  };
}
