const maxAttempts = 8;

export async function dispatchNextOrderEvent(pool) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const { rows: [event] } = await client.query(`
      SELECT id, delivery_attempts FROM order_outbox
      WHERE published_at IS NULL AND failed_at IS NULL AND next_attempt_at <= now()
      ORDER BY next_attempt_at, created_at, id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
    if (!event) {
      await client.query("COMMIT");
      return "empty";
    }

    await client.query("SAVEPOINT inbox_delivery");
    try {
      await client.query(
        "INSERT INTO order_event_inbox(event_id) VALUES($1) ON CONFLICT (event_id) DO NOTHING",
        [event.id],
      );
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT inbox_delivery");
      const attempts = event.delivery_attempts + 1;
      const exhausted = attempts >= maxAttempts;
      await client.query(`
        UPDATE order_outbox SET delivery_attempts=$2,
          next_attempt_at=now()+make_interval(secs=>$3),
          failed_at=CASE WHEN $4::boolean THEN now() ELSE NULL END
        WHERE id=$1
      `, [event.id, attempts, Math.min(3600, 30 * 2 ** (attempts - 1)), exhausted]);
      await client.query("COMMIT");
      return exhausted ? "failed" : "retry";
    }

    await client.query("UPDATE order_outbox SET published_at=now() WHERE id=$1", [event.id]);
    await client.query("COMMIT");
    return "delivered";
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
