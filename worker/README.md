# Roblox upload relay

The Audio Uploader (`tools.html`) edits audio in the browser, but Roblox's
Open Cloud API can't be called from a web page directly. This Cloudflare
Worker forwards the upload. It doesn't store anything.

## Deploy (free, about 5 minutes)

1. Create a free account at https://dash.cloudflare.com
2. Go to **Workers & Pages** → **Create** → **Create Worker**, name it e.g. `lnz-upload`, then **Deploy**.
3. Click **Edit code**, replace everything with the contents of `roblox-proxy.js`, then **Deploy**.
4. Go to the worker's **Settings** → **Variables and Secrets** → **Add**:
   - Name: `ALLOWED_ORIGINS`
   - Value: `https://lnz-std.github.io` (add your custom domain later, comma-separated)
5. Copy the worker URL (looks like `https://lnz-upload.<your-name>.workers.dev`).
6. Paste it into `assets/js/data.js`:

   ```js
   uploadProxy: "https://lnz-upload.<your-name>.workers.dev",
   ```

## What users need

An Open Cloud API key from https://create.roblox.com/dashboard/credentials with:
- API system **Assets** → **Read** and **Write**
- Accepted IP addresses: `0.0.0.0/0` (uploads come from Cloudflare, whose IPs change)
