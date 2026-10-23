import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/live', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

router.get('/ready', async (req, res, next) => {
  const ready = mongoose.connection.readyState === 1;

  try {
    if (ready) {
      await mongoose.connection.db.admin().ping();
    }

    res.status(ready ? 200 : 503).json({
      success: ready,
      data: { status: ready ? 'ready' : 'not_ready', database: ready ? 'connected' : 'disconnected' }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
