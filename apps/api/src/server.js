import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { validateRuntimeConfig } from './config/runtime.js';
import mongoose from 'mongoose';

const currentDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDir, '../../../.env') });
dotenv.config();
validateRuntimeConfig();

const port = process.env.PORT || process.env.API_PORT || 4500;
const app = createApp();

const database = await connectDatabase();

const server = app.listen(port, () => {
  console.log(`EnvVault API listening on http://localhost:${port}`);
});

if (!database) scheduleDatabaseReconnect();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      mongoose.disconnect().finally(() => process.exit(0));
    });
  });
}

function scheduleDatabaseReconnect() {
  const timer = setTimeout(async () => {
    if (mongoose.connection.readyState === 1) return;
    console.log('Retrying MongoDB connection...');
    const connection = await connectDatabase();
    if (!connection) scheduleDatabaseReconnect();
  }, 5000);
  timer.unref();
}
