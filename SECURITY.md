# Security

Recall Inbox is designed for personal saved-item data. Treat OAuth tokens,
database connection strings, deployment ids, and synced content as private.

## Do Not Commit

- `.env`
- `.data/x-token.json`
- `.data/items.json`
- `outputs/`
- `wrangler.toml`
- `X_CLIENT_SECRET`
- `GITHUB_TOKEN`
- `ADMIN_SECRET`
- `POSTGRES_URL`
- Cloudflare D1 database ids if they identify a private deployment

Use `.env.example` and `wrangler.example.toml` as public templates. Keep real
environment files and deployment configs local or in your hosting provider's
secret store.

## Cloudflare Secrets

Use Wrangler secrets for Worker credentials:

```bash
yarn wrangler secret put X_CLIENT_ID
yarn wrangler secret put X_CLIENT_SECRET
yarn wrangler secret put GITHUB_TOKEN
yarn wrangler secret put ADMIN_SECRET
```

Keep the generated `wrangler.toml` private because it contains deployment
specific database ids.

## Vercel Secrets

Set these values as Vercel environment variables, not committed files:

```text
POSTGRES_URL
ADMIN_SECRET
GITHUB_TOKEN
X_CLIENT_ID
X_CLIENT_SECRET
```

`POSTGRES_URL` should be treated as a database password. Rotate it if it is ever
shared publicly.

## Public Exposure

Do not expose a deployment without `ADMIN_SECRET`. Manual sync and hosted X
authorization are operator actions and should stay protected. The review UI
contains synced personal content; use a private deployment unless you
intentionally want that content visible.

## Rotation

If a token or secret is accidentally exposed, rotate it in the source service
first, then update local `.env`, `.data/x-token.json`, Cloudflare Worker
secrets, and Vercel environment variables as applicable.
