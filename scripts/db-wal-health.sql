WITH pending AS (
  SELECT count(*)::int AS ready_count,
         extract(epoch FROM now() - min(modification))::double precision AS oldest_ready_seconds
    FROM pg_catalog.pg_ls_archive_statusdir()
   WHERE name LIKE '%.ready'
), wal_size AS (
  SELECT coalesce(sum(size),0)::bigint AS wal_directory_bytes
  FROM pg_catalog.pg_ls_waldir()
), sample AS (
  SELECT current_setting('archive_mode') AS archive_mode,
         pg_is_in_recovery() AS in_recovery,
         a.last_archived_time,
         a.last_failed_time,
         a.failed_count,
         a.stats_reset,
         p.ready_count,
         p.oldest_ready_seconds,
         w.wal_directory_bytes,
         coalesce(nullif(current_setting('narenj.wal_max_directory_bytes',true), '')::bigint,1073741824) AS max_directory_bytes,
         coalesce(nullif(current_setting('narenj.wal_max_pending_seconds',true), '')::integer,120) AS max_pending_seconds
    FROM pg_catalog.pg_stat_archiver a CROSS JOIN pending p CROSS JOIN wal_size w
), health AS (
  SELECT *, array_remove(ARRAY[
    CASE WHEN in_recovery THEN 'not_primary' END,
    CASE WHEN archive_mode NOT IN ('on','always') THEN 'archive_disabled' END,
    CASE WHEN ready_count > 0 AND last_failed_time IS NOT NULL
       AND (last_archived_time IS NULL OR last_failed_time > last_archived_time)
       THEN 'archive_failed_with_pending_wal' END,
    CASE WHEN oldest_ready_seconds >= max_pending_seconds THEN 'wal_backlog_overdue' END,
    CASE WHEN wal_directory_bytes >= max_directory_bytes THEN 'wal_directory_limit' END
  ],NULL) AS reasons
  FROM sample
)
SELECT to_jsonb(health) || jsonb_build_object('healthy',cardinality(reasons)=0) AS report FROM health;
