import { Router } from 'express';
import authRoutes from './authRoutes';
import botRoutes from './botRoutes';
import configRoutes from './configRoutes';
import engineRoutes from './engineRoutes';
import positionRoutes from './positionRoutes';
import signalRoutes from './signalRoutes';
import tradeRoutes from './tradeRoutes';
import analyticsRoutes from './analyticsRoutes';
import mlRoutes from './mlRoutes';
import ppoRoutes from './ppoRoutes';
import taxReportRoutes from './taxReportRoutes';
import alertRoutes from './alertRoutes';
import mlMetricsRoutes from './mlMetricsRoutes';
import manualTradeRoutes from './manualTradeRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/bot', botRoutes);
router.use('/config', configRoutes);
router.use('/engine', engineRoutes);
router.use('/positions', positionRoutes);
router.use('/signals', signalRoutes);
router.use('/trades', tradeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/ml', mlRoutes);
router.use('/ppo', ppoRoutes);
router.use('/tax-reports', taxReportRoutes);
router.use('/alerts', alertRoutes);
router.use('/ml-metrics', mlMetricsRoutes);
router.use('/manual-trade', manualTradeRoutes);

export default router;
