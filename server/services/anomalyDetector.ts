/**
 * Anomaly Detector
 * Detects unusual market conditions using Isolation Forest
 */

import { spawn } from 'child_process';
import * as path from 'path';

export interface AnomalyScore {
    isAnomaly: boolean;        // True if anomalous
    score: number;             // Anomaly score (lower = more anomalous)
    normalizedScore: number;   // 0-1 (0=anomaly, 1=normal)
    severity: 'NORMAL' | 'MILD' | 'MODERATE' | 'SEVERE';
    recommendation: 'TRADE' | 'CAUTION' | 'PAUSE' | 'STOP';
}

export interface MarketConditions {
    price: number;
    priceChange: number;
    highLowRange: number;
    volume: number;
    volumeChange: number;
    volatility: number;
}

export class AnomalyDetector {
    private pythonScript: string;
    private pauseThreshold: number = -0.5;  // Pause trading if score < -0.5

    constructor() {
        this.pythonScript = path.join(__dirname, '../ml_scripts/anomaly_scorer.py');
    }

    /**
     * Detect if current market conditions are anomalous
     */
    async detect(conditions: MarketConditions): Promise<AnomalyScore> {
        try {
            const result = await this.runPythonDetector(conditions);
            return this.interpretScore(result.score);
            
        } catch (error) {
            console.error('[AnomalyDetector] Error detecting anomaly:', error);
            
            // Return normal on error (don't block trading)
            return {
                isAnomaly: false,
                score: -0.4,
                normalizedScore: 0.7,
                severity: 'NORMAL',
                recommendation: 'TRADE'
            };
        }
    }

    /**
     * Run Python anomaly detector
     */
    private runPythonDetector(conditions: MarketConditions): Promise<any> {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', [
                this.pythonScript,
                JSON.stringify(conditions)
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
                    reject(new Error(`Python detector exited with code ${code}: ${stderr}`));
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
                reject(new Error('Python detector timeout'));
            }, 5000);
        });
    }

    /**
     * Interpret anomaly score
     */
    private interpretScore(score: number): AnomalyScore {
        // Isolation Forest scores are typically in range [-1, 0]
        // Lower scores = more anomalous
        
        const isAnomaly = score < -0.5;
        
        // Normalize to 0-1 (0=anomaly, 1=normal)
        // Assume score range is [-0.8, -0.3]
        const normalizedScore = Math.max(0, Math.min(1, (score + 0.8) / 0.5));
        
        // Determine severity
        let severity: AnomalyScore['severity'];
        let recommendation: AnomalyScore['recommendation'];
        
        if (score < -0.65) {
            // Severe anomaly
            severity = 'SEVERE';
            recommendation = 'STOP';  // Stop trading completely
            
        } else if (score < -0.55) {
            // Moderate anomaly
            severity = 'MODERATE';
            recommendation = 'PAUSE';  // Pause new trades
            
        } else if (score < -0.45) {
            // Mild anomaly
            severity = 'MILD';
            recommendation = 'CAUTION';  // Reduce position size
            
        } else {
            // Normal
            severity = 'NORMAL';
            recommendation = 'TRADE';  // Normal trading
        }
        
        return {
            isAnomaly,
            score,
            normalizedScore,
            severity,
            recommendation
        };
    }

    /**
     * Check if trading should be paused
     */
    async shouldPauseTrading(conditions: MarketConditions): Promise<boolean> {
        const anomaly = await this.detect(conditions);
        return anomaly.recommendation === 'PAUSE' || anomaly.recommendation === 'STOP';
    }

    /**
     * Get position size multiplier based on anomaly
     */
    async getPositionMultiplier(conditions: MarketConditions): Promise<number> {
        const anomaly = await this.detect(conditions);
        
        switch (anomaly.recommendation) {
            case 'STOP':
                return 0;      // No trading
            case 'PAUSE':
                return 0.3;    // Very small positions only
            case 'CAUTION':
                return 0.6;    // Reduced positions
            case 'TRADE':
            default:
                return 1.0;    // Normal positions
        }
    }

    /**
     * Set pause threshold
     */
    setPauseThreshold(threshold: number): void {
        this.pauseThreshold = threshold;
    }

    /**
     * Get pause threshold
     */
    getPauseThreshold(): number {
        return this.pauseThreshold;
    }
}

