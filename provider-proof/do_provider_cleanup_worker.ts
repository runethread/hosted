export default {
  fetch(): Response {
    return new Response("provider proof retired", { status: 410 });
  },
} satisfies ExportedHandler;
