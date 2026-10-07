import { Router } from 'express';
import { SUGGESTED_TIMEZONES } from '../domain/index.js';

export const timezonesRouter = Router();

timezonesRouter.get('/suggested', (_req, res) => {
  res.json({ timezones: SUGGESTED_TIMEZONES });
});
