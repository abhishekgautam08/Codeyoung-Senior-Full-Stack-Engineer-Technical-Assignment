/**
 * Express application factory.
 * Separated from the server startup for testability.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { errorHandler } from './middleware/index.js';
import { healthRouter } from './routes/health.js';
import { slotsRouter, availabilityRouter } from './routes/slots.js';
import { bookingsRouter } from './routes/bookings.js';
import { mentorsRouter } from './routes/mentors.js';
import { timezonesRouter } from './routes/timezones.js';

import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger.js';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    })
  );

  // Body parsing
  app.use(express.json());

  // Swagger Documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/timezones', timezonesRouter);
  app.use('/api/slots', slotsRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/mentors', mentorsRouter);

  // Central error handler (must be last)
  app.use(errorHandler);

  return app;
}
