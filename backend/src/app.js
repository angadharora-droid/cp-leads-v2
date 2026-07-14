import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import env from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import leadRoutes from './routes/lead.routes.js';
import kitRoutes from './routes/kit.routes.js';
import followUpRoutes from './routes/followup.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import auditRoutes from './routes/audit.routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', generalLimiter);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/kits', kitRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
