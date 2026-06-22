import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'express-async-errors';

import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { logger } from './shared/utils/logger';

// Route imports
import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import rolesRouter from './modules/roles/roles.router';
import ngosRouter from './modules/ngos/ngos.router';
import boreholesRouter from './modules/boreholes/boreholes.router';
import assignmentsRouter from './modules/assignments/assignments.router';
import formsRouter from './modules/forms/forms.router';
import surveysRouter from './modules/surveys/surveys.router';
import rehabilitationRouter from './modules/rehabilitation/rehabilitation.router';
import grievancesRouter from './modules/grievances/grievances.router';
import notificationsRouter from './modules/notifications/notifications.router';
import reportsRouter from './modules/reports/reports.router';
import filesRouter from './modules/files/files.router';
import dashboardRouter from './modules/dashboard/dashboard.router';
import auditRouter from './modules/audit/audit.router';
import waterTestingRouter from './modules/water-testing/water-testing.router';

const app = express();

// ─── Security ──────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      config.app.frontendUrl,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    ];
    if (!origin) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Logging ───────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.url === '/health',
}));

// ─── Body Parsing ──────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ─────────────────────────────────
app.use('/api', generalLimiter);

// ─── Health Check ──────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── API Routes ────────────────────────────────────
const apiRouter = express.Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/ngos', ngosRouter);
apiRouter.use('/boreholes', boreholesRouter);
apiRouter.use('/assignments', assignmentsRouter);
apiRouter.use('/forms', formsRouter);
apiRouter.use('/surveys', surveysRouter);
apiRouter.use('/rehabilitation', rehabilitationRouter);
apiRouter.use('/grievances', grievancesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/files', filesRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/water-testing', waterTestingRouter);

app.use('/api', apiRouter);

// ─── 404 ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route not found' });
});

// ─── Error Handler ─────────────────────────────────
app.use(errorHandler);

export default app;
