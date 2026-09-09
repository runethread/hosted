const BASE_URL = (process.env.PROVIDER_DO_PROOF_URL ?? "https://runethread-provider-do-proof.karageorgiou-dev.workers.dev").replace(/\/$/, "");

await run();

async function run() {
  console.log(`PROVIDER_PROOF do base=${BASE_URL}`);
  await request("/health");
  await request("/reset", { method: "POST" });

  const transaction = await request("/transaction-rollback", { method: "POST" });
  assert(transaction.threw === true, "transaction callback must throw");
  assert(transaction.rowCount === 0, `rolled-back transaction leaked ${transaction.rowCount} rows`);
  console.log("PROVIDER_PROOF do transaction-rollback=proven");

  const before = await request("/seed-before", { method: "POST" });
  assert(before.snapshot.rows.phase === "before", "seed-before phase mismatch");
  assert(before.snapshot.rows.generation === "1", "seed-before generation mismatch");
  assert(typeof before.bookmark === "string" && before.bookmark.length > 0, "missing PITR bookmark");

  const after = await request("/mutate-after", { method: "POST" });
  assert(after.snapshot.rows.phase === "after", "mutate-after phase mismatch");
  assert(after.snapshot.rows.generation === "2", "mutate-after generation mismatch");
  assert(after.snapshot.rows.after_only === "present", "mutate-after marker missing");
  assert(after.bookmark > before.bookmark, "PITR bookmarks did not advance lexically");

  await request("/restore", {
    method: "POST",
    body: JSON.stringify({ bookmark: before.bookmark }),
    headers: { "content-type": "application/json" },
  });

  const restored = await poll(async () => {
    const snapshot = await request("/snapshot");
    return snapshot.rows.phase === "before" &&
      snapshot.rows.generation === "1" &&
      snapshot.rows.after_only === undefined
      ? snapshot
      : null;
  }, 30_000, 500, "PITR restore");
  console.log(`PROVIDER_PROOF do pitr-restored bookmark=${before.bookmark} current=${restored.bookmark}`);

  await request("/schedule-alarm", { method: "POST" });
  const alarmState = await poll(async () => {
    const snapshot = await request("/snapshot");
    const attempts = Number(snapshot.rows.alarm_attempts ?? "0");
    const done = snapshot.rows.alarm_done === "1";
    const retryCount = Number(snapshot.rows.alarm_last_retry_count ?? "-1");
    const isRetry = snapshot.rows.alarm_last_is_retry === "1";
    return done && attempts >= 2 && retryCount >= 1 && isRetry ? snapshot : null;
  }, 90_000, 1000, "alarm retry");

  console.log(
    `PROVIDER_PROOF do alarm-retry attempts=${alarmState.rows.alarm_attempts} retry_count=${alarmState.rows.alarm_last_retry_count} is_retry=${alarmState.rows.alarm_last_is_retry}`,
  );

  await request("/reset", { method: "POST" });
  const clean = await request("/snapshot");
  assert(Object.keys(clean.rows).length === 0, "proof DO rows were not cleaned up");
  assert(clean.alarm === null, "proof DO alarm was not cleaned up");

  console.log("PROVIDER_PROOF do PASS transaction=1 pitr=1 alarm_retry=1 cleanup=1");
}

async function request(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON ${response.status}: ${text}`);
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function poll(fn, timeoutMs, intervalMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== null) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not complete within ${timeoutMs}ms${lastError ? `; last error: ${lastError}` : ""}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
