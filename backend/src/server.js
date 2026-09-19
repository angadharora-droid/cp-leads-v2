import env from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { startFollowUpReminders } from './services/notification.service.js';

async function start() {
  try {
    await connectDB();
    const server = app.listen(env.PORT, () => {
      console.log(
        `[server] CPH Leads CRM API running at http://localhost:${env.PORT} (${env.NODE_ENV})`
      );
    });

    // Follow-ups falling due today or slipping overdue raise in-app reminders.
    startFollowUpReminders();

    const shutdown = (signal) => {
      console.log(`[server] ${signal} received, shutting down...`);
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[server] failed to start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
  process.exit(1);
});

start();
