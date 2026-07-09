import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import cliRoutes from './routes/cli.routes.js';
import environmentRoutes from './routes/environments.routes.js';
import projectRoutes from './routes/projects.routes.js';
import variableRoutes from './routes/variables.routes.js';
import { getPublicOrigin } from './config/runtime.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const webOrigins = (process.env.WEB_ORIGIN || getPublicOrigin())
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.set('etag', false);
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet({
    strictTransportSecurity: process.env.NODE_ENV === 'production'
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false
  }));
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || webOrigins.includes(origin));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));
  app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'envvault-api',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
  });

  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ready });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/environments', environmentRoutes);
  app.use('/api/variables', variableRoutes);
  app.use('/api/cli', cliRoutes);

  app.use('/api', notFoundHandler);
  if (process.env.NODE_ENV === 'production') {
    const webDist = resolve(currentDir, '../../web/dist');
    app.use('/assets', express.static(resolve(webDist, 'assets'), { maxAge: '1y', immutable: true }));
    app.get('*', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }
  app.use(errorHandler);

  return app;
}
