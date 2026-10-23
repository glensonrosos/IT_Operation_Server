import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { processDueSchedules } from './services/maintenanceScheduleService.js';

let server;

async function start() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API server listening'));
  const scheduleTimer = setInterval(() => processDueSchedules().catch((error) => logger.error({ err: error }, 'Routine maintenance scheduler failed')), 60_000);
  server.on('close', () => clearInterval(scheduleTimer));
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal({ port: env.PORT }, 'API server could not start because the port is already in use; stop the existing API process or choose another PORT');
      process.exit(1);
    }
    logger.fatal({ err: error }, 'API server listener failed');
    process.exit(1);
  });
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server?.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start API server');
  process.exit(1);
});
