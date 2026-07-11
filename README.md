# EnvVault

EnvVault is a developer-first environment variable vault: encrypted `.env` sync with a web dashboard, API, CLI, and shared crypto package.

This repository follows the MVP architecture described in `docs.html`.

## Workspace

```text
apps/
  web/              React dashboard
  api/              Express REST API
  cli/              Node CLI
packages/
  crypto-core/      Shared encryption, env parsing, and diff helpers
```

## First commands

```bash
npm install
npm run dev:web
npm run dev:api
npm run cli -- status
```

## Security boundary

The API stores ciphertext only. Encryption and decryption live in clients through `@envvault/crypto-core`.

## Version history API

Environment snapshots are recorded after web variable changes, bulk imports, environment clones, restores, and CLI pushes. Snapshots store encrypted values only.

```text
GET  /api/environments/:id/versions
GET  /api/environments/:id/versions/:versionId
POST /api/environments/:id/versions/:versionId/restore
```

Restoring a production environment requires the same `x-envvault-production-confirm: production` header used by other production mutations.

## Test

```bash
npm test
```

The suite covers shared encryption, RSA device-key handoff, API security/error responses, the bundled CLI artifact, and the production web build.

## OAuth

GitHub and Google use authorization-code OAuth. Configure the callback URLs in each provider:

```text
http://localhost:4500/api/auth/github/callback
http://localhost:4500/api/auth/google/callback
```

Google login appears automatically when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured.

## Production

Copy `.env.example` into your deployment secret manager and provide production values. Production startup fails when required configuration is missing, the JWT secret is shorter than 32 characters, the web origin is not HTTPS, or development login is enabled.

Build the API and web containers from the repository root:

```bash
docker build -f Dockerfile.api -t envvault-api .
docker build -f Dockerfile.web --build-arg VITE_API_BASE=https://api.example.com/api -t envvault-web .
```

Run the API behind a TLS-terminating reverse proxy and use `/health` for liveness and `/ready` for MongoDB readiness.

For the recommended single-service Render staging deployment, use `render.yaml` and follow [deploy/STAGING.md](deploy/STAGING.md). The Render image serves the React dashboard and API from one HTTPS origin.

Required production secrets:

```text
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...
WEB_ORIGIN=https://app.example.com
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://api.example.com/api/auth/github/callback
```

Google variables are optional until that provider is enabled:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/google/callback
```

## CLI Release

The CLI is bundled into `apps/cli/dist/index.cjs` and publishes as `@itspawansaini/envvault`:

```bash
npm login
npm publish --access=public --workspace @itspawansaini/envvault
```

After publishing, developers can run `npx @itspawansaini/envvault`.
