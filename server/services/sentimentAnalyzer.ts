/**
 * Sentiment Analyzer
 * Integrates Fear & Greed Index and other sentiment indicators
 */

import axios from 'axios';

export interface SentimentMetrics {
    fearGreedIndex: number;        // 0-100 (0=extreme fear, 100=extreme greed)
    fearGreedLabel: string;        // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
    sentiment: 'BEARISH' | 'NEUTRAL' | 'BULLISH';
    confidence: number;            // 0-1
    recommendation: 'AVOID' | 'CAUTION' | 'NEUTRAL' | 'FAVORABLE' | 'STRONG';
}

export class SentimentAnalyzer {
    private fearGreedApiUrl: string = 'https://api.alternative.me/fng/';
    private cache: { data: any; timestamp: number } | null = null;
    private cacheDuration: number = 3600000;  // 1 hour

    /**
     * Analyze current market sentiment
     */
    async analyze(): Promise<SentimentMetrics> {
        try {
            const fearGreedData = await this.getFearGreedIndex();
            return this.calculateSentiment(fearGreedData);
            
        } catch (error) {
            console.error('[SentimentAnalyzer] Error analyzing sentiment:', error);
            
            // Return neutral on error
            return {
                fearGreedIndex: 50,
                fearGreedLabel: 'Neutral',
                sentiment: 'NEUTRAL',
                confidence: 0.5,
                recommendation: 'NEUTRAL'
            };
        }
    }

    /**
     * Get Fear & Greed Index from API
     */
    private async getFearGreedIndex(): Promise<any> {
        // Check cache
        if (this.cache && Date.now() - this.cache.timestamp < this.cacheDuration) {
            return this.cache.data;
        }

        // Fetch from API
        const response = await axios.get(this.fearGreedApiUrl, {
            params: { limit: 1 },
            timeout: 5000
        });

        const data = response.data.data[0];
        
        // Update cache
        this.cache = {
            data: data,
            timestamp: Date.now()
        };

        return data;
    }

    /**
     * Calculate sentiment metrics
     */
    private calculateSentiment(fearGreedData: any): SentimentMetrics {
        const fearGreedIndex = parseInt(fearGreedData.value);
        const fearGreedLabel = fearGreedData.value_classification;

        // Determine sentiment
        let sentiment: SentimentMetrics['sentiment'];
        let confidence: number;
        let recommendation: SentimentMetrics['recommendation'];

        if (fearGreedIndex <= 20) {
            // Extreme Fear (0-20)
            sentiment = 'BEARISH';
            confidence = 0.9;
            recommendation = 'AVOID';  // Too fearful, wait
            
        } else if (fearGreedIndex <= 40) {
            // Fear (21-40)
            sentiment = 'BEARISH';
            confidence = 0.7;
            recommendation = 'CAUTION';  // Slightly bearish, be careful
            
        } else if (fearGreedIndex <= 60) {
            // Neutral (41-60)
            sentiment = 'NEUTRAL';
            confidence = 0.5;
            recommendation = 'NEUTRAL';  // Neutral market
            
        } else if (fearGreedIndex <= 80) {
            // Greed (61-80)
            sentiment = 'BULLISH';
            confidence = 0.7;
            recommendation = 'FAVORABLE';  // Bullish, good for buying
            
        } else {
            // Extreme Greed (81-100)
            sentiment = 'BULLISH';
            confidence = 0.9;
            recommendation = 'STRONG';  // Very bullish, strong buy
        }

        return {
            fearGreedIndex,
            fearGreedLabel,
            sentiment,
            confidence,
            recommendation
        };
    }

    /**
     * Check if sentiment is favorable for a trade
     */
    async isFavorable(direction: 'BUY' | 'SELL'): Promise<boolean> {
        const metrics = await this.analyze();

        if (direction === 'BUY') {
            // Favorable for buying: Greed or Extreme Greed
            return metrics.fearGreedIndex >= 60;
        } else {
            // Favorable for selling: Fear or Extreme Fear
            return metrics.fearGreedIndex <= 40;
        }
    }

    /**
     * Get position sizing multiplier based on sentiment
     * Returns 0.5 to 1.5
     */
    async getSizingMultiplier(direction: 'BUY' | 'SELL'): Promise<number> {
        const metrics = await this.analyze();

        if (direction === 'BUY') {
            // More bullish = larger size
            if (metrics.fearGreedIndex >= 80) return 1.5;  // Extreme greed
            if (metrics.fearGreedIndex >= 60) return 1.2;  // Greed
            if (metrics.fearGreedIndex >= 40) return 1.0;  // Neutral
            if (metrics.fearGreedIndex >= 20) return 0.7;  // Fear
            return 0.5;  // Extreme fear
            
        } else {
            // More bearish = larger short size
            if (metrics.fearGreedIndex <= 20) return 1.5;  // Extreme fear
            if (metrics.fearGreedIndex <= 40) return 1.2;  // Fear
            if (metrics.fearGreedIndex <= 60) return 1.0;  // Neutral
            if (metrics.fearGreedIndex <= 80) return 0.7;  // Greed
            return 0.5;  // Extreme greed
        }
    }

    /**
     * Clear cache (for testing)
     */
    clearCache(): void {
        this.cache = null;
    }
}

