/**
 * Market Regime Detector
 * Detects current market regime: BULL, BEAR, or SIDEWAYS
 */

import axios from 'axios';

export type MarketRegime = 'BULL' | 'BEAR' | 'SIDEWAYS';

export interface RegimeMetrics {
    regime: MarketRegime;
    confidence: number;        // 0-1
    trendStrength: number;     // 0-1 (0=sideways, 1=strong trend)
    volatility: number;        // Current volatility
    momentum: number;          // -1 to 1 (negative=bearish, positive=bullish)
    recommendation: {
        positionSizeMultiplier: number;  // 0.5-1.5
        strategy: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
    };
}

export class RegimeDetector {
    private binanceApiUrl: string = 'https://api.binance.com';
    private cache: Map<string, { data: RegimeMetrics; timestamp: number }> = new Map();
    private cacheDuration: number = 300000;  // 5 minutes

    /**
     * Detect current market regime for a symbol
     */
    async detect(symbol: string): Promise<RegimeMetrics> {
        try {
            // Check cache
            const cached = this.cache.get(symbol);
            if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
                return cached.data;
            }

            // Fetch historical data
            const klines = await this.fetchKlines(symbol, '1h', 100);
            
            // Calculate regime
            const metrics = this.calculateRegime(klines);
            
            // Update cache
            this.cache.set(symbol, {
                data: metrics,
                timestamp: Date.now()
            });

            return metrics;
            
        } catch (error) {
            console.error('[RegimeDetector] Error detecting regime:', error);
            
            // Return neutral regime on error
            return {
                regime: 'SIDEWAYS',
                confidence: 0.5,
                trendStrength: 0,
                volatility: 0.02,
                momentum: 0,
                recommendation: {
                    positionSizeMultiplier: 1.0,
                    strategy: 'MODERATE'
                }
            };
        }
    }

    /**
     * Fetch klines (candlestick data) from Binance
     */
    private async fetchKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
        const response = await axios.get(`${this.binanceApiUrl}/api/v3/klines`, {
            params: {
                symbol: symbol,
                interval: interval,
                limit: limit
            },
            timeout: 5000
        });

        return response.data;
    }

    /**
     * Calculate market regime from klines
     */
    private calculateRegime(klines: any[]): RegimeMetrics {
        // Extract close prices
        const closes = klines.map(k => parseFloat(k[4]));
        const volumes = klines.map(k => parseFloat(k[5]));
        
        // Calculate indicators
        const sma20 = this.calculateSMA(closes, 20);
        const sma50 = this.calculateSMA(closes, 50);
        const currentPrice = closes[closes.length - 1];
        
        // Price position relative to SMAs
        const priceAboveSMA20 = currentPrice > sma20;
        const priceAboveSMA50 = currentPrice > sma50;
        const sma20AboveSMA50 = sma20 > sma50;
        
        // Calculate trend strength (ADX-like)
        const returns = this.calculateReturns(closes);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const trendStrength = Math.abs(avgReturn) * 100;  // 0-1 scale
        
        // Calculate volatility (std dev of returns)
        const volatility = this.calculateStdDev(returns);
        
        // Calculate momentum (rate of change)
        const momentum = (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20];
        
        // Determine regime
        let regime: MarketRegime;
        let confidence: number;
        
        if (priceAboveSMA20 && priceAboveSMA50 && sma20AboveSMA50 && momentum > 0.05) {
            // Strong uptrend
            regime = 'BULL';
            confidence = Math.min(0.9, 0.6 + trendStrength);
            
        } else if (!priceAboveSMA20 && !priceAboveSMA50 && !sma20AboveSMA50 && momentum < -0.05) {
            // Strong downtrend
            regime = 'BEAR';
            confidence = Math.min(0.9, 0.6 + trendStrength);
            
        } else if (trendStrength < 0.3 && Math.abs(momentum) < 0.03) {
            // Sideways / ranging
            regime = 'SIDEWAYS';
            confidence = Math.min(0.9, 0.6 + (1 - trendStrength));
            
        } else if (momentum > 0) {
            // Weak uptrend
            regime = 'BULL';
            confidence = 0.5 + trendStrength / 2;
            
        } else {
            // Weak downtrend
            regime = 'BEAR';
            confidence = 0.5 + trendStrength / 2;
        }
        
        // Generate recommendation
        const recommendation = this.generateRecommendation(regime, confidence, trendStrength, volatility);
        
        return {
            regime,
            confidence,
            trendStrength,
            volatility,
            momentum,
            recommendation
        };
    }

    /**
     * Generate trading recommendation based on regime
     */
    private generateRecommendation(
        regime: MarketRegime,
        confidence: number,
        trendStrength: number,
        volatility: number
    ): RegimeMetrics['recommendation'] {
        
        let positionSizeMultiplier = 1.0;
        let strategy: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
        
        if (regime === 'BULL' && confidence >= 0.7) {
            // Strong bull market - aggressive
            positionSizeMultiplier = 1.3;
            strategy = 'AGGRESSIVE';
            
        } else if (regime === 'BULL') {
            // Weak bull market - moderate
            positionSizeMultiplier = 1.1;
            strategy = 'MODERATE';
            
        } else if (regime === 'BEAR' && confidence >= 0.7) {
            // Strong bear market - conservative (reduce size)
            positionSizeMultiplier = 0.6;
            strategy = 'CONSERVATIVE';
            
        } else if (regime === 'BEAR') {
            // Weak bear market - moderate
            positionSizeMultiplier = 0.8;
            strategy = 'MODERATE';
            
        } else {
            // Sideways market - conservative
            positionSizeMultiplier = 0.7;
            strategy = 'CONSERVATIVE';
        }
        
        // Adjust for volatility (high volatility = smaller size)
        if (volatility > 0.05) {
            positionSizeMultiplier *= 0.8;
        }
        
        // Clamp to reasonable range
        positionSizeMultiplier = Math.max(0.5, Math.min(1.5, positionSizeMultiplier));
        
        return {
            positionSizeMultiplier,
            strategy
        };
    }

    /**
     * Calculate Simple Moving Average
     */
    private calculateSMA(values: number[], period: number): number {
        const slice = values.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    }

    /**
     * Calculate returns
     */
    private calculateReturns(prices: number[]): number[] {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        return returns;
    }

    /**
     * Calculate standard deviation
     */
    private calculateStdDev(values: number[]): number {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}

