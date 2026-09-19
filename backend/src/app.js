import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'node:path';

import env from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import leadRoutes from './routes/lead.routes.js';
import kitRoutes from './routes/kit.routes.js';
import followUpRoutes from './routes/followup.routes.js';
import reportRoutes from './routes/report.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import auditRoutes from './routes/audit.routes.js';
import enquiryRoutes from './routes/enquiry.routes.js';
import banquetRoutes from './routes/banquet.routes.js';
import signRoutes from './routes/sign.routes.js';
import arcRoutes from './routes/arc.routes.js';
import prospectusRoutes from './routes/prospectus.routes.js';
import estimateRoutes from './routes/estimate.routes.js';
import { authenticate } from './middleware/auth.js';
import { requireModule } from './middleware/rbac.js';

const app = express();

app.set('trust proxy', 1);

// When the built client is served from here, its PDF preview opens blob:
// URLs in an iframe, which helmet's default Content-Security-Policy blocks.
app.use(
  helmet(
    env.SERVE_CLIENT_DIR
      ? {
          contentSecurityPolicy: {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              'frame-src': ["'self'", 'blob:'],
            },
          },
        }
      : {}
  )
);
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(cookieParser());
// Room for a drawn signature (a PNG data URL, capped at 300,000 characters by its validation).
app.use(express.json({ limit: '500kb' }));
app.use(morgan('dev'));

app.use('/api', generalLimiter);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// The Leads CRM is one module; the Function Prospectus section is another.
// Each user opens only the modules assigned to them (admins open all).
app.use(
  ['/api/leads', '/api/kits', '/api/follow-ups', '/api/reports', '/api/dashboard', '/api/enquiries', '/api/banquet', '/api/arcs'],
  authenticate,
  requireModule('leads')
);
app.use('/api/leads', leadRoutes);
app.use('/api/kits', kitRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/banquet', banquetRoutes);
app.use('/api/arcs', arcRoutes);
app.use('/api/prospectus', prospectusRoutes);
app.use('/api/estimates', estimateRoutes);
// Public client-facing signing links (token-gated, unauthenticated).
app.use('/api/sign', signRoutes);

// Single-container deployments (see Dockerfile) serve the built React app
// from SERVE_CLIENT_DIR; every GET outside /api falls through to index.html
// so client-side routes such as /enquiries/:id and /sign/:token resolve.
if (env.SERVE_CLIENT_DIR) {
  const clientDir = path.resolve(env.SERVE_CLIENT_DIR);
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under /assets; index.html and the
        // favicon keep their names and must be revalidated on each load.
        const cacheControl = filePath.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache';
        res.setHeader('Cache-Control', cacheControl);
      },
    })
  );
  app.get(new RegExp('^/(?!api(/|$)).*'), (_req, res, next) => {
    res.sendFile(
      path.join(clientDir, 'index.html'),
      { headers: { 'Cache-Control': 'no-cache' } },
      (err) => {
        if (err) next(err);
      }
    );
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
