const body = JSON.stringify({ error: "not_operational" });

export default {
  async fetch(): Promise<Response> {
    return new Response(body, {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
} satisfies ExportedHandler<Env>;
