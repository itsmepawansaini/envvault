# EnvVault Staging Deployment

## 1. Rotate credentials

Before deployment, rotate the MongoDB database password and GitHub OAuth client secret that were used during local development.

## 2. Create the GitHub OAuth app

Create a separate OAuth app for staging:

```text
Application name: EnvVault Staging
Homepage URL: https://envvault-staging.onrender.com
Authorization callback URL: https://envvault-staging.onrender.com/api/auth/github/callback
```

If Render assigns a different hostname, use the assigned hostname in both fields.

## 3. Push the repository

Create an empty GitHub repository, add it as `origin`, and push the `main` branch.

## 4. Create the Render Blueprint

In Render:

1. Select **New > Blueprint**.
2. Connect the GitHub repository.
3. Render detects `render.yaml`.
4. Enter the prompted values:
   - `MONGODB_URI`: rotated MongoDB Atlas URI
   - `GITHUB_CLIENT_ID`: staging OAuth app client ID
   - `GITHUB_CLIENT_SECRET`: staging OAuth app client secret
5. Create the Blueprint.

Render generates `JWT_SECRET` automatically and disables development login.

## 5. Verify

```bash
curl https://envvault-staging.onrender.com/ready
curl https://envvault-staging.onrender.com/health
```

Then verify GitHub login in the browser. Render free web services sleep after inactivity, so the first staging request can take about one minute.

## 6. Release CLI 0.1.1

After the Render URL is confirmed, update the CLI default API URL, bump the package to `0.1.1`, publish it, and test:

```bash
npx @itspawansaini/envvault@0.1.1 login
```
