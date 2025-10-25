/**
 * ML Confidence Scorer
 * Uses ensemble models to score trade confidence (NOT predict direction)
 */

import { spawn } from 'child_process';
import * as path from 'path';

export interface ConfidenceScore {
    overall: number;           // 0-1 overall confidence
    rf_confidence: number;     // Random Forest confidence
    xgb_confidence: number;    // XGBoost confidence
    lstm_confidence: number;   // LSTM confidence
    agreement: number;         // Model agreement (0-1)
    recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    threshold_met: boolean;    // Whether confidence > threshold
}

export interface MarketState {
    symbol: string;
    price: number;
    volume: number;
    volatility: number;
    rsi: number;
    macd: number;
    bb_position: number;
    funding_rate?: number;
    vwap_deviation?: number;
}

export class MLConfidenceScorer {
    private pythonScript: string;
    private confidenceThreshold: number;

    constructor(confidenceThreshold: number = 0.70) {
        this.pythonScript = path.join(__dirname, '../ml_scripts/confidence_scorer.py');
        this.confidenceThreshold = confidenceThreshold;
    }

    /**
     * Score confidence for a trade signal
     */
    async scoreConfidence(state: MarketState, signalDirection: 'BUY' | 'SELL'): Promise<ConfidenceScore> {
        try {
            const result = await this.runPythonScorer(state, signalDirection);
            
            // Calculate overall confidence
            const overall = (result.rf_confidence + result.xgb_confidence + result.lstm_confidence) / 3;
            
            // Calculate agreement (how much models agree)
            const confidences = [result.rf_confidence, result.xgb_confidence, result.lstm_confidence];
            const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
            const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
            const agreement = 1 - Math.sqrt(variance);  // Higher agreement = lower variance
            
            // Determine recommendation
            let recommendation: ConfidenceScore['recommendation'];
            if (overall >= 0.80 && agreement >= 0.85) {
                recommendation = signalDirection === 'BUY' ? 'STRONG_BUY' : 'STRONG_SELL';
            } else if (overall >= 0.70 && agreement >= 0.75) {
                recommendation = signalDirection === 'BUY' ? 'BUY' : 'SELL';
            } else {
                recommendation = 'NEUTRAL';
            }
            
            const threshold_met = overall >= this.confidenceThreshold && agreement >= 0.70;
            
            return {
                overall,
                rf_confidence: result.rf_confidence,
                xgb_confidence: result.xgb_confidence,
                lstm_confidence: result.lstm_confidence,
                agreement,
                recommendation,
                threshold_met
            };
            
        } catch (error) {
            console.error('[MLConfidenceScorer] Error scoring confidence:', error);
            
            // Return neutral on error (don't block trading)
            return {
                overall: 0.50,
                rf_confidence: 0.50,
                xgb_confidence: 0.50,
                lstm_confidence: 0.50,
                agreement: 1.0,
                recommendation: 'NEUTRAL',
                threshold_met: false
            };
        }
    }

    /**
     * Run Python confidence scorer
     */
    private runPythonScorer(state: MarketState, direction: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', [
                this.pythonScript,
                JSON.stringify(state),
                direction
            ]);

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python scorer exited with code ${code}: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Failed to parse Python output: ${stdout}`));
                }
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                python.kill();
                reject(new Error('Python scorer timeout'));
            }, 5000);
        });
    }

    /**
     * Check if ML models are available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const testState: MarketState = {
                symbol: 'BTCUSDT',
                price: 50000,
                volume: 1000,
                volatility: 0.02,
                rsi: 50,
                macd: 0,
                bb_position: 0.5
            };
            
            await this.scoreConfidence(testState, 'BUY');
            return true;
        } catch (error) {
            console.error('[MLConfidenceScorer] Models not available:', error);
            return false;
        }
    }

    /**
     * Set confidence threshold
     */
    setThreshold(threshold: number): void {
        if (threshold < 0 || threshold > 1) {
            throw new Error('Threshold must be between 0 and 1');
        }
        this.confidenceThreshold = threshold;
    }

    /**
     * Get current threshold
     */
    getThreshold(): number {
        return this.confidenceThreshold;
    }
}

