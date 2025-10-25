/**
 * Hybrid Trading Filter
 * Integrates ML confidence, order book, and sentiment analysis
 * to filter rule-based trading signals
 */

import { MLConfidenceScorer, MarketState, ConfidenceScore } from './mlConfidenceScorer';
import { OrderBookAnalyzer, OrderBookMetrics } from './orderBookAnalyzer';
import { SentimentAnalyzer, SentimentMetrics } from './sentimentAnalyzer';

export interface FilterDecision {
    shouldTrade: boolean;
    confidence: number;           // 0-1 overall confidence
    reason: string;
    details: {
        mlScore: ConfidenceScore;
        orderBook: OrderBookMetrics;
        sentiment: SentimentMetrics;
    };
    positionSizeMultiplier: number;  // 0.5-1.5 based on conditions
}

export interface FilterConfig {
    mlEnabled: boolean;
    mlThreshold: number;           // 0-1, default 0.70
    orderBookEnabled: boolean;
    sentimentEnabled: boolean;
    requireAllPass: boolean;       // If true, all filters must pass
}

export class HybridTradingFilter {
    private mlScorer: MLConfidenceScorer;
    private orderBookAnalyzer: OrderBookAnalyzer;
    private sentimentAnalyzer: SentimentAnalyzer;
    private config: FilterConfig;

    constructor(config?: Partial<FilterConfig>) {
        this.config = {
            mlEnabled: true,
            mlThreshold: 0.70,
            orderBookEnabled: true,
            sentimentEnabled: true,
            requireAllPass: false,  // By default, use weighted scoring
            ...config
        };

        this.mlScorer = new MLConfidenceScorer(this.config.mlThreshold);
        this.orderBookAnalyzer = new OrderBookAnalyzer();
        this.sentimentAnalyzer = new SentimentAnalyzer();
    }

    /**
     * Filter a trading signal
     * Returns decision on whether to execute the trade
     */
    async filter(
        symbol: string,
        direction: 'BUY' | 'SELL',
        marketState: MarketState
    ): Promise<FilterDecision> {
        
        try {
            // Run all analyses in parallel
            const [mlScore, orderBook, sentiment] = await Promise.all([
                this.config.mlEnabled 
                    ? this.mlScorer.scoreConfidence(marketState, direction)
                    : this.getDefaultMLScore(),
                this.config.orderBookEnabled
                    ? this.orderBookAnalyzer.analyze(symbol)
                    : this.getDefaultOrderBookMetrics(),
                this.config.sentimentEnabled
                    ? this.sentimentAnalyzer.analyze()
                    : this.getDefaultSentimentMetrics()
            ]);

            // Evaluate decision
            const decision = this.evaluateDecision(direction, mlScore, orderBook, sentiment);

            return {
                ...decision,
                details: {
                    mlScore,
                    orderBook,
                    sentiment
                }
            };

        } catch (error) {
            console.error('[HybridTradingFilter] Error filtering signal:', error);
            
            // On error, return conservative decision (don't trade)
            return {
                shouldTrade: false,
                confidence: 0,
                reason: `Filter error: ${error.message}`,
                details: {
                    mlScore: this.getDefaultMLScore(),
                    orderBook: this.getDefaultOrderBookMetrics(),
                    sentiment: this.getDefaultSentimentMetrics()
                },
                positionSizeMultiplier: 1.0
            };
        }
    }

    /**
     * Evaluate trading decision based on all filters
     */
    private evaluateDecision(
        direction: 'BUY' | 'SELL',
        mlScore: ConfidenceScore,
        orderBook: OrderBookMetrics,
        sentiment: SentimentMetrics
    ): Omit<FilterDecision, 'details'> {
        
        const checks = {
            ml: this.config.mlEnabled ? mlScore.threshold_met : true,
            orderBook: this.config.orderBookEnabled ? orderBook.isLiquid : true,
            sentiment: this.config.sentimentEnabled ? this.checkSentiment(direction, sentiment) : true
        };

        // Require all pass mode
        if (this.config.requireAllPass) {
            const allPass = checks.ml && checks.orderBook && checks.sentiment;
            
            if (!allPass) {
                const failedChecks = [];
                if (!checks.ml) failedChecks.push('ML confidence too low');
                if (!checks.orderBook) failedChecks.push('Order book illiquid');
                if (!checks.sentiment) failedChecks.push('Sentiment unfavorable');
                
                return {
                    shouldTrade: false,
                    confidence: mlScore.overall,
                    reason: `Failed checks: ${failedChecks.join(', ')}`,
                    positionSizeMultiplier: 1.0
                };
            }
            
            return {
                shouldTrade: true,
                confidence: mlScore.overall,
                reason: 'All filters passed',
                positionSizeMultiplier: this.calculatePositionMultiplier(mlScore, orderBook, sentiment)
            };
        }

        // Weighted scoring mode (default)
        const weights = {
            ml: 0.50,        // ML confidence: 50%
            orderBook: 0.25,  // Order book: 25%
            sentiment: 0.25   // Sentiment: 25%
        };

        const scores = {
            ml: this.config.mlEnabled ? mlScore.overall : 0.5,
            orderBook: this.config.orderBookEnabled ? orderBook.liquidityScore : 0.5,
            sentiment: this.config.sentimentEnabled ? sentiment.confidence : 0.5
        };

        const overallConfidence = 
            scores.ml * weights.ml +
            scores.orderBook * weights.orderBook +
            scores.sentiment * weights.sentiment;

        // Decision threshold
        const threshold = 0.60;  // Need 60% overall confidence
        const shouldTrade = overallConfidence >= threshold;

        let reason: string;
        if (shouldTrade) {
            reason = `Confidence ${(overallConfidence * 100).toFixed(1)}% (ML: ${(scores.ml * 100).toFixed(0)}%, OB: ${(scores.orderBook * 100).toFixed(0)}%, Sentiment: ${(scores.sentiment * 100).toFixed(0)}%)`;
        } else {
            reason = `Confidence too low: ${(overallConfidence * 100).toFixed(1)}% < ${threshold * 100}%`;
        }

        return {
            shouldTrade,
            confidence: overallConfidence,
            reason,
            positionSizeMultiplier: this.calculatePositionMultiplier(mlScore, orderBook, sentiment)
        };
    }

    /**
     * Check if sentiment is favorable for direction
     */
    private checkSentiment(direction: 'BUY' | 'SELL', sentiment: SentimentMetrics): boolean {
        if (direction === 'BUY') {
            // For buying, avoid extreme fear
            return sentiment.fearGreedIndex >= 30;
        } else {
            // For selling, avoid extreme greed
            return sentiment.fearGreedIndex <= 70;
        }
    }

    /**
     * Calculate position size multiplier based on conditions
     */
    private calculatePositionMultiplier(
        mlScore: ConfidenceScore,
        orderBook: OrderBookMetrics,
        sentiment: SentimentMetrics
    ): number {
        
        let multiplier = 1.0;

        // ML confidence boost
        if (mlScore.overall >= 0.80) {
            multiplier *= 1.2;  // High confidence = 20% larger
        } else if (mlScore.overall <= 0.60) {
            multiplier *= 0.8;  // Low confidence = 20% smaller
        }

        // Order book liquidity boost
        if (orderBook.liquidityScore >= 0.8) {
            multiplier *= 1.1;  // High liquidity = 10% larger
        } else if (orderBook.liquidityScore <= 0.5) {
            multiplier *= 0.9;  // Low liquidity = 10% smaller
        }

        // Sentiment boost
        if (sentiment.confidence >= 0.8) {
            multiplier *= 1.1;  // Strong sentiment = 10% larger
        } else if (sentiment.confidence <= 0.5) {
            multiplier *= 0.9;  // Weak sentiment = 10% smaller
        }

        // Clamp to reasonable range
        return Math.max(0.5, Math.min(1.5, multiplier));
    }

    /**
     * Get default ML score (neutral)
     */
    private getDefaultMLScore(): ConfidenceScore {
        return {
            overall: 0.5,
            rf_confidence: 0.5,
            xgb_confidence: 0.5,
            lstm_confidence: 0.5,
            agreement: 1.0,
            recommendation: 'NEUTRAL',
            threshold_met: false
        };
    }

    /**
     * Get default order book metrics (neutral)
     */
    private getDefaultOrderBookMetrics(): OrderBookMetrics {
        return {
            bidAskSpread: 0.1,
            bidAskSpreadBps: 10,
            orderBookImbalance: 0,
            bidDepth: 0,
            askDepth: 0,
            liquidityScore: 0.5,
            isLiquid: true,
            recommendation: 'NEUTRAL'
        };
    }

    /**
     * Get default sentiment metrics (neutral)
     */
    private getDefaultSentimentMetrics(): SentimentMetrics {
        return {
            fearGreedIndex: 50,
            fearGreedLabel: 'Neutral',
            sentiment: 'NEUTRAL',
            confidence: 0.5,
            recommendation: 'NEUTRAL'
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<FilterConfig>): void {
        this.config = { ...this.config, ...config };
        
        if (config.mlThreshold !== undefined) {
            this.mlScorer.setThreshold(config.mlThreshold);
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): FilterConfig {
        return { ...this.config };
    }
}

