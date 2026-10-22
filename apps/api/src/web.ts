import express, { Router } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Serve only the compiled SPA. API routes and missing assets keep their 404. */
export function createWebRouter(directory: string): Router {
  const root = resolve(directory);
  const index = resolve(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error('WEB_BUILD_MISSING: ejecute npm run build:deploy antes de iniciar production.');
  }

  const router = Router();
  router.use((req, _res, next) => {
    const path = req.path.toLowerCase();
    if (!['GET', 'HEAD'].includes(req.method) || path === '/api' || path.startsWith('/api/') ||
      path.split('/')[1]?.startsWith('.')) return next('router');
    next();
  });
  router.use('/assets', express.static(resolve(root, 'assets'), {
    index: false, redirect: false, dotfiles: 'deny', maxAge: '1y', immutable: true,
  }));
  router.use(express.static(root, {
    index: false, redirect: false, dotfiles: 'deny',
    setHeaders: res => { res.setHeader('Cache-Control', 'no-cache'); },
  }));
  router.use((req, res, next) => {
    if (req.path.toLowerCase() === '/assets' || req.path.toLowerCase().startsWith('/assets/') ||
      !req.accepts('html')) return next();
    res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } }, error => {
      if (error) next(error);
    });
  });
  return router;
}
