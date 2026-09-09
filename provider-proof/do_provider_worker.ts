import { DurableObject } from "cloudflare:workers";

type Env = {
  PROOF_DO: DurableObjectNamespace<ProviderProofDO>;
};

type ProofRow = {
  name: string;
  value: string;
};

type AlarmInfo = {
  retryCount: number;
  isRetry: boolean;
};

type Snapshot = {
  rows: Record<string, string>;
};

const INSTANCE_NAME = "repository-1358994027";

export class ProviderProofDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS proof_state (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async reset(): Promise<Snapshot> {
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.sql.exec("DELETE FROM proof_state;");
    await this.ctx.storage.sync();
    return this.snapshotSync();
  }

  async proveTransactionRollback(): Promise<{ threw: boolean; rowCount: number }> {
    this.ctx.storage.sql.exec("DELETE FROM proof_state;");
    let threw = false;
    try {
      this.ctx.storage.transactionSync(() => {
        this.upsert("txn_a", "written");
        this.upsert("txn_b", "written");
        throw new Error("provider proof intentional transaction rollback");
      });
    } catch {
      threw = true;
    }

    const row = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM proof_state;")
      .one();
    return { threw, rowCount: Number(row.count) };
  }

  async seedBefore(): Promise<{ bookmark: string; snapshot: Snapshot }> {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM proof_state;");
      this.upsert("phase", "before");
      this.upsert("generation", "1");
    });
    await this.ctx.storage.sync();
    const bookmark = await this.ctx.storage.getCurrentBookmark();
    return { bookmark, snapshot: this.snapshotSync() };
  }

  async mutateAfter(): Promise<{ bookmark: string; snapshot: Snapshot }> {
    this.ctx.storage.transactionSync(() => {
      this.upsert("phase", "after");
      this.upsert("generation", "2");
      this.upsert("after_only", "present");
    });
    await this.ctx.storage.sync();
    const bookmark = await this.ctx.storage.getCurrentBookmark();
    return { bookmark, snapshot: this.snapshotSync() };
  }

  async restoreTo(bookmark: string): Promise<never> {
    await this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
    this.ctx.abort();
  }

  async scheduleRetryingAlarm(): Promise<{ scheduledAt: number }> {
    this.ctx.storage.transactionSync(() => {
      this.upsert("alarm_attempts", "0");
      this.upsert("alarm_done", "0");
      this.upsert("alarm_last_retry_count", "-1");
      this.upsert("alarm_last_is_retry", "0");
    });
    const scheduledAt = Date.now() + 500;
    await this.ctx.storage.setAlarm(scheduledAt);
    await this.ctx.storage.sync();
    return { scheduledAt };
  }

  async alarm(alarmInfo?: AlarmInfo): Promise<void> {
    const retryCount = alarmInfo?.retryCount ?? 0;
    const isRetry = alarmInfo?.isRetry ?? false;
    const attempts = Number(this.getValue("alarm_attempts") ?? "0") + 1;

    this.ctx.storage.transactionSync(() => {
      this.upsert("alarm_attempts", String(attempts));
      this.upsert("alarm_last_retry_count", String(retryCount));
      this.upsert("alarm_last_is_retry", isRetry ? "1" : "0");
      if (retryCount > 0) {
        this.upsert("alarm_done", "1");
      }
    });
    await this.ctx.storage.sync();

    if (retryCount === 0) {
      throw new Error("provider proof intentional first alarm failure");
    }
  }

  async snapshot(): Promise<Snapshot & { bookmark: string; alarm: number | null }> {
    const bookmark = await this.ctx.storage.getCurrentBookmark();
    const alarm = await this.ctx.storage.getAlarm();
    return { ...this.snapshotSync(), bookmark, alarm };
  }

  private snapshotSync(): Snapshot {
    const rows = this.ctx.storage.sql
      .exec<ProofRow>("SELECT name, value FROM proof_state ORDER BY name ASC;")
      .toArray();
    return { rows: Object.fromEntries(rows.map((row) => [row.name, row.value])) };
  }

  private upsert(name: string, value: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO proof_state(name, value) VALUES(?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value;`,
      name,
      value,
    );
  }

  private getValue(name: string): string | undefined {
    const rows = this.ctx.storage.sql
      .exec<ProofRow>("SELECT name, value FROM proof_state WHERE name = ?;", name)
      .toArray();
    return rows[0]?.value;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const stub = env.PROOF_DO.getByName(INSTANCE_NAME);

    try {
      if (request.method === "GET" && url.pathname === "/snapshot") {
        return json(await stub.snapshot());
      }
      if (request.method === "POST" && url.pathname === "/reset") {
        return json(await stub.reset());
      }
      if (request.method === "POST" && url.pathname === "/transaction-rollback") {
        return json(await stub.proveTransactionRollback());
      }
      if (request.method === "POST" && url.pathname === "/seed-before") {
        return json(await stub.seedBefore());
      }
      if (request.method === "POST" && url.pathname === "/mutate-after") {
        return json(await stub.mutateAfter());
      }
      if (request.method === "POST" && url.pathname === "/schedule-alarm") {
        return json(await stub.scheduleRetryingAlarm());
      }
      if (request.method === "POST" && url.pathname === "/restore") {
        const body = (await request.json()) as { bookmark?: unknown };
        if (typeof body.bookmark !== "string" || body.bookmark.length === 0) {
          return json({ error: "bookmark_required" }, 400);
        }
        try {
          await stub.restoreTo(body.bookmark);
        } catch {
          // ctx.abort() intentionally terminates the DO session so the configured PITR restore takes effect.
        }
        return json({ restore_requested: true }, 202);
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, proof: "sqlite-do-pitr-alarm" });
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json(
        {
          error: "provider_proof_error",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
