import env from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { startFollowUpReminders } from './services/notification.service.js';
import { startPaymentSweep } from './services/payment.service.js';
import { migrateToProperties } from './services/property.service.js';

async function start() {
  try {
    await connectDB();
    // Properties exist and older data is HCP's before any request arrives.
    await migrateToProperties();
    const server = app.listen(env.PORT, () => {
      console.log(
        `[server] CPH Leads CRM API running at http://localhost:${env.PORT} (${env.NODE_ENV})`
      );
    });

    // Follow-ups falling due today or slipping overdue raise in-app reminders.
    startFollowUpReminders();
    // Payments falling due tell the team, and email the client where the booking opted in.
    startPaymentSweep();

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
