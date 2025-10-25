/**
 * Multi-Timeframe Analyzer
 * Analyzes multiple timeframes for trend confirmation
 */

import axios from 'axios';

export interface TimeframeSignal {
    timeframe: string;
    trend: 'UP' | 'DOWN' | 'NEUTRAL';
    strength: number;  // 0-1
}

export interface MultiTimeframeAnalysis {
    alignment: number;          // 0-1 (1 = all timeframes agree)
    overallTrend: 'UP' | 'DOWN' | 'NEUTRAL';
    confidence: number;         // 0-1
    timeframes: TimeframeSignal[];
    recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    shouldTrade: boolean;
}

export class MultiTimeframeAnalyzer {
    private binanceApiUrl: string = 'https://api.binance.com';
    private timeframes: string[] = ['5m', '15m', '1h', '4h'];
    private cache: Map<string, { data: MultiTimeframeAnalysis; timestamp: number }> = new Map();
    private cacheDuration: number = 60000;  // 1 minute

    /**
     * Analyze multiple timeframes for a symbol
     */
    async analyze(symbol: string, direction: 'BUY' | 'SELL'): Promise<MultiTimeframeAnalysis> {
        try {
            const cacheKey = `${symbol}_${direction}`;
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
                return cached.data;
            }

            // Analyze each timeframe
            const signals = await Promise.all(
                this.timeframes.map(tf => this.analyzeTimeframe(symbol, tf))
            );

            // Calculate overall analysis
            const analysis = this.calculateOverallAnalysis(signals, direction);

            // Update cache
            this.cache.set(cacheKey, {
                data: analysis,
                timestamp: Date.now()
            });

            return analysis;
            
        } catch (error) {
            console.error('[MultiTimeframeAnalyzer] Error analyzing timeframes:', error);
            
            return {
                alignment: 0.5,
                overallTrend: 'NEUTRAL',
                confidence: 0,
                timeframes: [],
                recommendation: 'NEUTRAL',
                shouldTrade: false
            };
        }
    }

    /**
     * Analyze a single timeframe
     */
    private async analyzeTimeframe(symbol: string, timeframe: string): Promise<TimeframeSignal> {
        try {
            // Fetch klines
            const klines = await this.fetchKlines(symbol, timeframe, 50);
            
            // Extract close prices
            const closes = klines.map((k: any) => parseFloat(k[4]));
            
            // Calculate indicators
            const sma20 = this.calculateSMA(closes, 20);
            const sma50 = this.calculateSMA(closes, Math.min(50, closes.length));
            const currentPrice = closes[closes.length - 1];
            
            // Determine trend
            let trend: 'UP' | 'DOWN' | 'NEUTRAL';
            let strength: number;
            
            const priceVsSMA20 = (currentPrice - sma20) / sma20;
            const smaAlignment = (sma20 - sma50) / sma50;
            
            if (priceVsSMA20 > 0.02 && smaAlignment > 0.01) {
                // Strong uptrend
                trend = 'UP';
                strength = Math.min(1, Math.abs(priceVsSMA20) * 20);
                
            } else if (priceVsSMA20 < -0.02 && smaAlignment < -0.01) {
                // Strong downtrend
                trend = 'DOWN';
                strength = Math.min(1, Math.abs(priceVsSMA20) * 20);
                
            } else if (priceVsSMA20 > 0) {
                // Weak uptrend
                trend = 'UP';
                strength = Math.min(0.6, Math.abs(priceVsSMA20) * 10);
                
            } else if (priceVsSMA20 < 0) {
                // Weak downtrend
                trend = 'DOWN';
                strength = Math.min(0.6, Math.abs(priceVsSMA20) * 10);
                
            } else {
                // Neutral
                trend = 'NEUTRAL';
                strength = 0;
            }
            
            return {
                timeframe,
                trend,
                strength
            };
            
        } catch (error) {
            console.error(`[MultiTimeframeAnalyzer] Error analyzing ${timeframe}:`, error);
            return {
                timeframe,
                trend: 'NEUTRAL',
                strength: 0
            };
        }
    }

    /**
     * Calculate overall analysis from all timeframes
     */
    private calculateOverallAnalysis(
        signals: TimeframeSignal[],
        direction: 'BUY' | 'SELL'
    ): MultiTimeframeAnalysis {
        
        // Count trends
        const upCount = signals.filter(s => s.trend === 'UP').length;
        const downCount = signals.filter(s => s.trend === 'DOWN').length;
        const neutralCount = signals.filter(s => s.trend === 'NEUTRAL').length;
        
        // Determine overall trend
        let overallTrend: 'UP' | 'DOWN' | 'NEUTRAL';
        if (upCount > downCount && upCount > neutralCount) {
            overallTrend = 'UP';
        } else if (downCount > upCount && downCount > neutralCount) {
            overallTrend = 'DOWN';
        } else {
            overallTrend = 'NEUTRAL';
        }
        
        // Calculate alignment (how many timeframes agree)
        const maxCount = Math.max(upCount, downCount, neutralCount);
        const alignment = maxCount / signals.length;
        
        // Calculate confidence (alignment + strength)
        const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
        const confidence = (alignment + avgStrength) / 2;
        
        // Check if trend matches direction
        const trendMatchesDirection = 
            (direction === 'BUY' && overallTrend === 'UP') ||
            (direction === 'SELL' && overallTrend === 'DOWN');
        
        // Determine recommendation
        let recommendation: MultiTimeframeAnalysis['recommendation'];
        let shouldTrade: boolean;
        
        if (trendMatchesDirection && alignment >= 0.75 && confidence >= 0.70) {
            // Strong alignment and high confidence
            recommendation = direction === 'BUY' ? 'STRONG_BUY' : 'STRONG_SELL';
            shouldTrade = true;
            
        } else if (trendMatchesDirection && alignment >= 0.50 && confidence >= 0.60) {
            // Moderate alignment
            recommendation = direction === 'BUY' ? 'BUY' : 'SELL';
            shouldTrade = true;
            
        } else {
            // Low alignment or trend doesn't match
            recommendation = 'NEUTRAL';
            shouldTrade = false;
        }
        
        return {
            alignment,
            overallTrend,
            confidence,
            timeframes: signals,
            recommendation,
            shouldTrade
        };
    }

    /**
     * Fetch klines from Binance
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
     * Calculate Simple Moving Average
     */
    private calculateSMA(values: number[], period: number): number {
        const slice = values.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Set custom timeframes
     */
    setTimeframes(timeframes: string[]): void {
        this.timeframes = timeframes;
    }

    /**
     * Get current timeframes
     */
    getTimeframes(): string[] {
        return [...this.timeframes];
    }
}

