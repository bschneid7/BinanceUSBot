import { Router, Request, Response } from 'express';
import Position from '../models/Position';
import Trade from '../models/Trade';
import BotState from '../models/BotState';
import { MLMonitor } from '../services/mlMonitor';
import { AdvancedRiskManager } from '../services/advancedRiskManager';
import { RegimeDetector } from '../services/regimeDetector';
import { SentimentAnalyzer } from '../services/sentimentAnalyzer';

const router = Router();

/**
 * GET /api/dashboard/overview
 * High-level snapshot of bot status
 */
router.get('/overview', async (req: Request, res: Response) => {
    try {
        const botState = await BotState.findOne();
        const positions = await Position.find({ status: 'OPEN' });
        const trades = await Trade.find().sort({ createdAt: -1 }).limit(100);
        
        // Calculate metrics
        const totalEquity = botState?.totalEquity || 0;
        const dailyPnL = calculateDailyPnL(trades);
        const weeklyPnL = calculateWeeklyPnL(trades);
        const monthlyPnL = calculateMonthlyPnL(trades);
        const winRate = calculateWinRate(trades);
        const openPositionsCount = positions.length;
        
        // Bot status
        const botStatus = botState?.isActive ? 'RUNNING' : 'PAUSED';
        const lastUpdate = botState?.updatedAt || new Date();
        
        res.json({
            success: true,
            data: {
                totalEquity,
                dailyPnL,
                weeklyPnL,
                monthlyPnL,
                winRate,
                openPositionsCount,
                botStatus,
                lastUpdate,
                equityCurve: await getEquityCurve(7) // Last 7 days
            }
        });
    } catch (error) {
        console.error('[Dashboard] Error in /overview:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch overview' });
    }
});

/**
 * GET /api/dashboard/positions
 * All open and recent closed positions
 */
router.get('/positions', async (req: Request, res: Response) => {
    try {
        const { status = 'OPEN', limit = 50 } = req.query;
        
        const query: any = {};
        if (status !== 'ALL') {
            query.status = status;
        }
        
        const positions = await Position.find(query)
            .sort({ updatedAt: -1 })
            .limit(Number(limit));
        
        // Enrich with current prices and PnL
        const enrichedPositions = await Promise.all(
            positions.map(async (pos) => {
                const currentPrice = await getCurrentPrice(pos.symbol);
                const unrealizedPnL = calculateUnrealizedPnL(pos, currentPrice);
                const unrealizedPnLPercent = (unrealizedPnL / (pos.entryPrice * pos.quantity)) * 100;
                
                return {
                    ...pos.toObject(),
                    currentPrice,
                    unrealizedPnL,
                    unrealizedPnLPercent,
                    timeHeld: Date.now() - pos.createdAt.getTime()
                };
            })
        );
        
        res.json({
            success: true,
            data: enrichedPositions
        });
    } catch (error) {
        console.error('[Dashboard] Error in /positions:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch positions' });
    }
});

/**
 * GET /api/dashboard/performance
 * Detailed performance metrics
 */
router.get('/performance', async (req: Request, res: Response) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Number(days));
        
        const trades = await Trade.find({
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });
        
        // Calculate comprehensive metrics
        const metrics = {
            totalTrades: trades.length,
            winningTrades: trades.filter(t => t.pnl > 0).length,
            losingTrades: trades.filter(t => t.pnl < 0).length,
            winRate: calculateWinRate(trades),
            totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0),
            averageWin: calculateAverageWin(trades),
            averageLoss: calculateAverageLoss(trades),
            largestWin: Math.max(...trades.map(t => t.pnl)),
            largestLoss: Math.min(...trades.map(t => t.pnl)),
            profitFactor: calculateProfitFactor(trades),
            sharpeRatio: await calculateSharpeRatio(trades),
            maxDrawdown: await calculateMaxDrawdown(trades),
            averageTradeDuration: calculateAverageDuration(trades),
            
            // By playbook
            byPlaybook: calculateByPlaybook(trades),
            
            // Time series
            dailyReturns: calculateDailyReturns(trades),
            cumulativeReturns: calculateCumulativeReturns(trades)
        };
        
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('[Dashboard] Error in /performance:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch performance' });
    }
});

/**
 * GET /api/dashboard/ml-status
 * ML system status and metrics
 */
router.get('/ml-status', async (req: Request, res: Response) => {
    try {
        // Get ML metrics from MLMonitor
        // Use authenticated user ID or default for development
        const userId = (req as any).user?._id || '000000000000000000000000';
        
        let mlMetrics, regime, sentiment, recentPredictions;
        
        try {
            mlMetrics = await MLMonitor.getMetrics(userId, '24h');
        } catch (error) {
            console.error('[Dashboard] Error getting ML metrics:', error);
            mlMetrics = null;
        }
        
        try {
            const regimeDetector = new RegimeDetector();
            regime = await regimeDetector.detectRegime('BTCUSDT', 100);
        } catch (error) {
            console.error('[Dashboard] Error detecting regime:', error);
            regime = { regime: 'UNKNOWN', confidence: 0 };
        }
        
        try {
            const sentimentAnalyzer = new SentimentAnalyzer();
            sentiment = await sentimentAnalyzer.getSentiment();
        } catch (error) {
            console.error('[Dashboard] Error getting sentiment:', error);
            sentiment = { sentiment: 'NEUTRAL', score: 0 };
        }
        
        try {
            recentPredictions = await MLMonitor.getRecentPredictions(20);
        } catch (error) {
            console.error('[Dashboard] Error getting recent predictions:', error);
            recentPredictions = [];
        }
        
        res.json({
            success: true,
            data: {
                metrics: mlMetrics,
                regime,
                sentiment,
                recentPredictions,
                modelsLoaded: mlMetrics !== null,
                lastUpdate: new Date()
            }
        });
    } catch (error) {
        console.error('[Dashboard] Error in /ml-status:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch ML status' });
    }
});

/**
 * GET /api/dashboard/risk-metrics
 * Risk management metrics
 */
router.get('/risk-metrics', async (req: Request, res: Response) => {
    try {
        const botState = await BotState.findOne();
        const positions = await Position.find({ status: 'OPEN' });
        
        const riskManager = new AdvancedRiskManager();
        const riskStats = await riskManager.getRiskStatistics();
        const portfolioHeat = await riskManager.calculatePortfolioHeat(positions);
        
        res.json({
            success: true,
            data: {
                currentDrawdown: botState?.currentDrawdown || 0,
                maxDrawdown: botState?.maxDrawdown || 0,
                portfolioHeat,
                riskLevel: riskStats.riskLevel,
                kellyMultiplier: riskStats.kellyMultiplier,
                consecutiveLosses: riskStats.consecutiveLosses,
                correlationExposure: await calculateCorrelationExposure(positions),
                riskLimits: {
                    softDrawdownLimit: 0.10,
                    hardDrawdownLimit: 0.20,
                    maxPortfolioHeat: 0.20,
                    maxPositionRisk: 0.05
                }
            }
        });
    } catch (error) {
        console.error('[Dashboard] Error in /risk-metrics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch risk metrics' });
    }
});

/**
 * GET /api/dashboard/signals
 * Recent trading signals
 */
router.get('/signals', async (req: Request, res: Response) => {
    try {
        const { limit = 50 } = req.query;
        
        // Signals are stored in a separate collection or can be derived from trades
        // For now, we'll return recent trades with signal information
        const trades = await Trade.find()
            .sort({ createdAt: -1 })
            .limit(Number(limit));
        
        const signals = trades.map(trade => ({
            symbol: trade.symbol,
            type: trade.playbook,
            side: trade.side,
            confidence: trade.metadata?.mlConfidence || 0,
            mlFilterResult: trade.metadata?.mlFilterResult || 'UNKNOWN',
            reason: trade.metadata?.mlFilterReason || '',
            timestamp: trade.createdAt,
            executed: true
        }));
        
        res.json({
            success: true,
            data: signals
        });
    } catch (error) {
        console.error('[Dashboard] Error in /signals:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch signals' });
    }
});

/**
 * GET /api/dashboard/trades
 * Recent trades with details
 */
router.get('/trades', async (req: Request, res: Response) => {
    try {
        const { limit = 100, symbol, playbook } = req.query;
        
        const query: any = {};
        if (symbol) query.symbol = symbol;
        if (playbook) query.playbook = playbook;
        
        const trades = await Trade.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit));
        
        res.json({
            success: true,
            data: trades
        });
    } catch (error) {
        console.error('[Dashboard] Error in /trades:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch trades' });
    }
});

// ========== Helper Functions ==========

function calculateDailyPnL(trades: any[]): number {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return trades
        .filter(t => t.createdAt >= oneDayAgo)
        .reduce((sum, t) => sum + t.pnl, 0);
}

function calculateWeeklyPnL(trades: any[]): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return trades
        .filter(t => t.createdAt >= oneWeekAgo)
        .reduce((sum, t) => sum + t.pnl, 0);
}

function calculateMonthlyPnL(trades: any[]): number {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    return trades
        .filter(t => t.createdAt >= oneMonthAgo)
        .reduce((sum, t) => sum + t.pnl, 0);
}

function calculateWinRate(trades: any[]): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    return (wins / trades.length) * 100;
}

async function getEquityCurve(days: number): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const trades = await Trade.find({
        createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 });
    
    let equity = 10000; // Starting equity
    const curve = [{ date: startDate.toISOString(), equity }];
    
    for (const trade of trades) {
        equity += trade.pnl;
        curve.push({
            date: trade.createdAt.toISOString(),
            equity
        });
    }
    
    return curve;
}

async function getCurrentPrice(symbol: string): Promise<number> {
    // This should call BinanceService.getPrice()
    // For now, return a placeholder
    return 50000;
}

function calculateUnrealizedPnL(position: any, currentPrice: number): number {
    const priceDiff = position.side === 'BUY' 
        ? currentPrice - position.entryPrice
        : position.entryPrice - currentPrice;
    return priceDiff * position.quantity;
}

function calculateAverageWin(trades: any[]): number {
    const wins = trades.filter(t => t.pnl > 0);
    if (wins.length === 0) return 0;
    return wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
}

function calculateAverageLoss(trades: any[]): number {
    const losses = trades.filter(t => t.pnl < 0);
    if (losses.length === 0) return 0;
    return losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
}

function calculateProfitFactor(trades: any[]): number {
    const totalWins = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    return totalLosses === 0 ? totalWins : totalWins / totalLosses;
}

async function calculateSharpeRatio(trades: any[]): Promise<number> {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.pnl);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    
    return stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252); // Annualized
}

async function calculateMaxDrawdown(trades: any[]): Promise<number> {
    let peak = 0;
    let maxDD = 0;
    let equity = 10000;
    
    for (const trade of trades) {
        equity += trade.pnl;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
    }
    
    return maxDD * 100;
}

function calculateAverageDuration(trades: any[]): number {
    if (trades.length === 0) return 0;
    const durations = trades.map(t => {
        const exit = t.exitTime || t.updatedAt;
        const entry = t.entryTime || t.createdAt;
        return exit.getTime() - entry.getTime();
    });
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}

function calculateByPlaybook(trades: any[]): any {
    const byPlaybook: any = {};
    for (const trade of trades) {
        const pb = trade.playbook || 'UNKNOWN';
        if (!byPlaybook[pb]) {
            byPlaybook[pb] = {
                count: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0
            };
        }
        byPlaybook[pb].count++;
        if (trade.pnl > 0) byPlaybook[pb].wins++;
        else byPlaybook[pb].losses++;
        byPlaybook[pb].totalPnL += trade.pnl;
    }
    return byPlaybook;
}

function calculateDailyReturns(trades: any[]): any[] {
    const dailyMap = new Map<string, number>();
    
    for (const trade of trades) {
        const dateKey = trade.createdAt.toISOString().split('T')[0];
        dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + trade.pnl);
    }
    
    return Array.from(dailyMap.entries()).map(([date, pnl]) => ({ date, pnl }));
}

function calculateCumulativeReturns(trades: any[]): any[] {
    let cumulative = 0;
    return trades.map(trade => {
        cumulative += trade.pnl;
        return {
            date: trade.createdAt.toISOString(),
            cumulative
        };
    });
}

async function calculateCorrelationExposure(positions: any[]): Promise<any> {
    // Group positions by correlation groups
    const groups = {
        BTC: 0,
        ETH: 0,
        ALT_MAJOR: 0,
        ALT_DEFI: 0,
        STABLECOIN: 0
    };
    
    for (const pos of positions) {
        const group = getCorrelationGroup(pos.symbol);
        groups[group] += pos.entryPrice * pos.quantity;
    }
    
    return groups;
}

function getCorrelationGroup(symbol: string): string {
    if (symbol.includes('BTC')) return 'BTC';
    if (symbol.includes('ETH')) return 'ETH';
    if (['SOL', 'BNB', 'ADA', 'DOT'].some(s => symbol.includes(s))) return 'ALT_MAJOR';
    if (['LINK', 'UNI', 'AAVE'].some(s => symbol.includes(s))) return 'ALT_DEFI';
    return 'STABLECOIN';
}

export default router;

