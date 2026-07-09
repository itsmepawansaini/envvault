# EnvVault CLI

End-to-end encrypted `.env` synchronization for developers and small teams.

EnvVault keeps environment variables consistent across projects, environments, browsers, and developer machines without sending plaintext secrets to the API.

## Highlights

- AES-256-GCM encryption and decryption happens locally
- Passwordless CLI device approval using RSA-OAEP
- GitHub device-code authentication
- Pull remote secrets into a local `.env`
- Preview key-level drift before pushing
- Extra confirmation for production environments
- No global installation required
- Shared crypto implementation across the web dashboard and CLI

## Requirements

- Node.js 20 or newer
- Access to an EnvVault API and dashboard
- A project and environment created in the dashboard

## Installation

Run EnvVault directly with `npx`:

```bash
npx @itspawansaini/envvault --help
```

Or install it globally:

```bash
npm install --global @itspawansaini/envvault
envvault --help
```

## Quick Start

### 1. Authenticate

```bash
npx @itspawansaini/envvault login
```

The CLI shows a GitHub device code. Complete authorization in the browser.

For a self-hosted or local API:

```bash
npx @itspawansaini/envvault login --api-base http://localhost:4500/api
```

You can also set the API endpoint once for the shell:

```bash
export ENVVAULT_API_BASE=http://localhost:4500/api
```

### 2. Link a project and environment

```bash
npx @itspawansaini/envvault init
```

Choose a project and environment interactively, or provide them directly:

```bash
npx @itspawansaini/envvault init \
  --project PROJECT_ID \
  --env development
```

The CLI creates an RSA device keypair and requests access to the project key. Open the EnvVault dashboard, find the request under **Team Access**, and approve it. The project key is encrypted to the CLI device's public key and unwrapped locally.

For a new, empty project created entirely from the CLI:

```bash
npx @itspawansaini/envvault init \
  --project PROJECT_ID \
  --env development \
  --generate-key
```

### 3. Pull secrets

```bash
npx @itspawansaini/envvault pull
```

This decrypts the selected environment locally and writes `.env`.

Choose another output path:

```bash
npx @itspawansaini/envvault pull --out .env.local
```

### 4. Check drift

```bash
npx @itspawansaini/envvault status
```

The output lists:

- `+ added`
- `~ changed`
- `- removed`
- `= same`

Secret values are never printed.

### 5. Push changes

```bash
npx @itspawansaini/envvault push
```

EnvVault reads the local `.env`, compares it with the remote environment, prints the key-level diff, requests confirmation, encrypts locally, and uploads ciphertext.

Use another source file:

```bash
npx @itspawansaini/envvault push --file .env.staging
```

Production pushes require an additional typed `production` confirmation.

## Command Reference

### `login`

Authenticate through GitHub's device-code flow.

```text
--api-base <url>   EnvVault API base URL
--dev              Use local development authentication
```

### `init`

Link the current folder to a project and environment.

```text
--api-base <url>   Override the stored API URL
--project <id>     Project ID
--env <name>       Environment name
--generate-key     Generate a key for an empty CLI-first project
```

### `pull`

Decrypt remote variables and write a local file.

```text
--out <path>       Output file, default: .env
```

### `status`

Compare the local file with the remote environment.

```text
--file <path>      Input file, default: .env
```

### `push`

Encrypt and upload the local environment after showing drift.

```text
--file <path>      Input file, default: .env
-y, --yes          Skip the first confirmation prompt
```

### `key publish`

Publish a passphrase-wrapped recovery copy of the local project key.

```text
--phrase <phrase>  Recovery sync phrase
```

### `key pull`

Restore a passphrase-wrapped project key.

```text
--phrase <phrase>  Recovery sync phrase
```

Device approval is the recommended handoff method. Passphrase commands remain available for recovery and compatibility.

## Local Files

EnvVault stores local state under `.envvault/`:

```text
.envvault/
  config.json        Selected project, environment, and API
  session.json       Access and rotating refresh session
  project-key.json   Local project key
  remote.json        Last pull/push metadata
```

`envvault init` automatically adds `.envvault` to `.gitignore`.

Never commit `.env`, `.envvault`, project keys, session files, or recovery phrases.

## Security Model

- Variable values are encrypted with AES-256-GCM
- Project-key handoff uses RSA-OAEP with SHA-256
- The CLI private device key and project key remain local
- The API stores ciphertext, public device keys, and encrypted key envelopes
- Decrypted values are written only to the requested local output file
- Pull, push, reveal, copy, export, and key approvals are represented in project activity logs

The server has no plaintext secret decryption pathway.

## Troubleshooting

### `Session expired. Run envvault login again.`

Authenticate again:

```bash
npx @itspawansaini/envvault login
```

### Project key approval expires

Run `init` again and approve the new request from the dashboard within 15 minutes.

### The CLI cannot decrypt remote variables

The local project key does not match the project's encryption key. Run `init` again for passwordless device approval, or use `key pull` with the project's recovery phrase.

### The wrong API is being used

Pass `--api-base` during login or set:

```bash
export ENVVAULT_API_BASE=https://your-envvault.example/api
```

### Production push is cancelled

Enter the exact lowercase word `production` when prompted.

## Source and Issues

- Source: [github.com/itsmepawansaini/envvault](https://github.com/itsmepawansaini/envvault)
- Issues: [github.com/itsmepawansaini/envvault/issues](https://github.com/itsmepawansaini/envvault/issues)

## License

MIT © 2026 Pawan Saini
