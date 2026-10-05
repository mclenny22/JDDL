function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request, env = {}) {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset binding is unavailable.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404) return assetResponse;

    if (request.method === "GET" && !url.pathname.includes(".")) {
      const indexRequest = new Request(new URL("/index.html", url), request);
      return env.ASSETS.fetch(indexRequest);
    }

    return notFound();
  },
};
