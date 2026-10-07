/*
 * LNZ.STD — Roblox upload relay (Cloudflare Worker)
 *
 * The Audio Uploader on the website can't call Roblox's API directly from
 * the browser, so it goes through this worker. The worker only forwards
 * requests: it never stores or logs the user's API key or files.
 *
 * Routes
 *   POST /users/resolve        { username }  -> { id, name }
 *   POST /assets               multipart     -> Open Cloud create-asset operation
 *   GET  /operations/:id                     -> Open Cloud operation status
 *
 * Env vars
 *   ALLOWED_ORIGINS  comma-separated list, e.g.
 *                    "https://lnz-std.github.io,https://lnzstd.my.id"
 */

const OPEN_CLOUD = "https://apis.roblox.com/assets/v1";
const USERS_API = "https://users.roblox.com/v1/usernames/users";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);

    const cors = {
      "Access-Control-Allow-Origin": originOk && origin ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Roblox-Api-Key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!originOk) return json({ message: "This site isn't allowed to use the upload relay." }, 403, cors);

    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/users/resolve") {
        const { username } = await request.json();
        if (!username) return json({ message: "Missing username." }, 400, cors);
        const res = await fetch(USERS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [String(username)], excludeBannedUsers: true }),
        });
        const data = await res.json().catch(() => ({}));
        const user = data.data && data.data[0];
        if (!user) return json({ message: `Couldn't find Roblox user "${username}".` }, 404, cors);
        return json({ id: String(user.id), name: user.name }, 200, cors);
      }

      const apiKey = request.headers.get("X-Roblox-Api-Key");
      if (!apiKey) return json({ message: "Missing Open Cloud API key." }, 401, cors);

      if (request.method === "POST" && url.pathname === "/assets") {
        const res = await fetch(`${OPEN_CLOUD}/assets`, {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": request.headers.get("Content-Type") },
          body: request.body,
        });
        return passthrough(res, cors);
      }

      const op = url.pathname.match(/^\/operations\/([\w-]+)$/);
      if (request.method === "GET" && op) {
        const res = await fetch(`${OPEN_CLOUD}/operations/${op[1]}`, { headers: { "x-api-key": apiKey } });
        return passthrough(res, cors);
      }

      return json({ message: "Not found." }, 404, cors);
    } catch (err) {
      return json({ message: "Couldn't reach Roblox. Try again in a moment." }, 502, cors);
    }
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function passthrough(res, headers) {
  return new Response(res.body, {
    status: res.status,
    headers: { ...headers, "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
