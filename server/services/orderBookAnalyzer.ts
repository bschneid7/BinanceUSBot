/**
 * Order Book Analyzer
 * Analyzes order book depth, spread, and imbalance
 */

import axios from 'axios';

export interface OrderBookMetrics {
    bidAskSpread: number;          // Spread in %
    bidAskSpreadBps: number;       // Spread in basis points
    orderBookImbalance: number;    // -1 to 1 (negative = more asks, positive = more bids)
    bidDepth: number;              // Total bid volume (top 10 levels)
    askDepth: number;              // Total ask volume (top 10 levels)
    liquidityScore: number;        // 0-1 (higher = more liquid)
    isLiquid: boolean;             // Whether market is liquid enough
    recommendation: 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE';
}

export class OrderBookAnalyzer {
    private binanceApiUrl: string = 'https://api.binance.com';
    private maxSpreadBps: number = 10;  // Max 10 bps spread
    private minLiquidityScore: number = 0.6;

    /**
     * Analyze order book for a symbol
     */
    async analyze(symbol: string): Promise<OrderBookMetrics> {
        try {
            const orderBook = await this.fetchOrderBook(symbol);
            return this.calculateMetrics(orderBook);
            
        } catch (error) {
            console.error('[OrderBookAnalyzer] Error analyzing order book:', error);
            
            // Return neutral metrics on error
            return {
                bidAskSpread: 0.1,
                bidAskSpreadBps: 10,
                orderBookImbalance: 0,
                bidDepth: 0,
                askDepth: 0,
                liquidityScore: 0.5,
                isLiquid: false,
                recommendation: 'NEUTRAL'
            };
        }
    }

    /**
     * Fetch order book from Binance
     */
    private async fetchOrderBook(symbol: string): Promise<any> {
        const response = await axios.get(`${this.binanceApiUrl}/api/v3/depth`, {
            params: {
                symbol: symbol,
                limit: 20  // Top 20 levels
            },
            timeout: 5000
        });

        return response.data;
    }

    /**
     * Calculate order book metrics
     */
    private calculateMetrics(orderBook: any): OrderBookMetrics {
        const bids = orderBook.bids;  // [[price, quantity], ...]
        const asks = orderBook.asks;

        // Best bid and ask
        const bestBid = parseFloat(bids[0][0]);
        const bestAsk = parseFloat(asks[0][0]);
        const midPrice = (bestBid + bestAsk) / 2;

        // Bid-ask spread
        const bidAskSpread = ((bestAsk - bestBid) / midPrice) * 100;  // %
        const bidAskSpreadBps = bidAskSpread * 100;  // basis points

        // Calculate depth (top 10 levels)
        const bidDepth = bids.slice(0, 10).reduce((sum: number, level: any) => {
            return sum + parseFloat(level[1]);
        }, 0);

        const askDepth = asks.slice(0, 10).reduce((sum: number, level: any) => {
            return sum + parseFloat(level[1]);
        }, 0);

        // Order book imbalance
        const totalDepth = bidDepth + askDepth;
        const orderBookImbalance = totalDepth > 0 
            ? (bidDepth - askDepth) / totalDepth 
            : 0;

        // Liquidity score (0-1)
        // Based on: tight spread + deep order book
        const spreadScore = Math.max(0, 1 - (bidAskSpreadBps / 20));  // 0 bps = 1.0, 20 bps = 0
        const depthScore = Math.min(1, totalDepth / 1000);  // Normalize to 1000 units
        const liquidityScore = (spreadScore + depthScore) / 2;

        // Is liquid enough?
        const isLiquid = bidAskSpreadBps <= this.maxSpreadBps && liquidityScore >= this.minLiquidityScore;

        // Recommendation
        let recommendation: OrderBookMetrics['recommendation'];
        if (isLiquid && orderBookImbalance > 0.2) {
            // Liquid + more bids = favorable for buying
            recommendation = 'FAVORABLE';
        } else if (isLiquid && orderBookImbalance < -0.2) {
            // Liquid + more asks = unfavorable for buying
            recommendation = 'UNFAVORABLE';
        } else if (!isLiquid) {
            // Illiquid = unfavorable
            recommendation = 'UNFAVORABLE';
        } else {
            recommendation = 'NEUTRAL';
        }

        return {
            bidAskSpread,
            bidAskSpreadBps,
            orderBookImbalance,
            bidDepth,
            askDepth,
            liquidityScore,
            isLiquid,
            recommendation
        };
    }

    /**
     * Check if order book is favorable for a trade
     */
    async isFavorable(symbol: string, direction: 'BUY' | 'SELL'): Promise<boolean> {
        const metrics = await this.analyze(symbol);

        // Must be liquid
        if (!metrics.isLiquid) {
            return false;
        }

        // For BUY: favorable if more bids (support)
        // For SELL: favorable if more asks (resistance)
        if (direction === 'BUY') {
            return metrics.orderBookImbalance > 0.1;  // At least 10% more bids
        } else {
            return metrics.orderBookImbalance < -0.1;  // At least 10% more asks
        }
    }

    /**
     * Set parameters
     */
    setParameters(maxSpreadBps: number, minLiquidityScore: number): void {
        this.maxSpreadBps = maxSpreadBps;
        this.minLiquidityScore = minLiquidityScore;
    }
}

