import mongoose from 'mongoose';
import { MLMonitor } from './mlMonitor';
import { BotConfig } from '../models/BotConfig';

/**
 * ML Guardrails Service
 * 
 * Monitors ML model performance and automatically disables it if performance degrades
 */

export class MLGuardrails {
  private userId: mongoose.Types.ObjectId;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  constructor(userId: mongoose.Types.ObjectId) {
    this.userId = userId;
  }
  
  /**
   * Start monitoring ML performance
   */
  start(intervalMinutes: number = 60): void {
    if (this.isRunning) {
      console.log('[MLGuardrails] Already running');
      return;
    }
    
    console.log(`[MLGuardrails] ✅ Started monitoring (check every ${intervalMinutes} minutes)`);
    this.isRunning = true;
    
    // Run initial check
    this.runCheck();
    
    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runCheck();
    }, intervalMinutes * 60 * 1000);
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    this.isRunning = false;
    console.log('[MLGuardrails] 🛑 Stopped monitoring');
  }
  
  /**
   * Run rollback check
   */
  private async runCheck(): Promise<void> {
    try {
      console.log('[MLGuardrails] Running rollback check...');
      
      // Check if ML is enabled
      const config = await BotConfig.findOne({ userId: this.userId }).lean();
      
      if (!config || !config.ml || !config.ml.enabled) {
        console.log('[MLGuardrails] ML is disabled, skipping check');
        return;
      }
      
      // Check rollback conditions
      const rollbackCheck = await MLMonitor.checkRollbackConditions(this.userId);
      
      if (rollbackCheck.shouldRollback) {
        console.log(`[MLGuardrails] ⚠️  Rollback condition met: ${rollbackCheck.reason}`);
        await this.executeRollback(rollbackCheck.reason!);
      } else {
        console.log('[MLGuardrails] ✅ All checks passed');
        
        // Log current metrics
        const metrics = await MLMonitor.getMetrics(this.userId, '24h');
        console.log(`[MLGuardrails] Current metrics: Predictions=${metrics.predictionsTotal}, Errors=${metrics.inferenceErrors}, Confidence=${(metrics.avgConfidence * 100).toFixed(1)}%`);
      }
    } catch (error) {
      console.error('[MLGuardrails] Error during rollback check:', error);
    }
  }
  
  /**
   * Execute automatic rollback
   */
  private async executeRollback(reason: string): Promise<void> {
    try {
      console.log('[MLGuardrails] 🛑 Executing automatic rollback...');
      console.log(`[MLGuardrails] Reason: ${reason}`);
      
      // Disable ML
      await BotConfig.updateOne(
        { userId: this.userId },
        {
          $set: {
            'ml.enabled': false,
            'ml.allocation_pct': 0
          }
        }
      );
      
      // Get final metrics
      const metrics = await MLMonitor.getMetrics(this.userId, '24h');
      
      // Send alert (would integrate with alert system)
      console.log('[MLGuardrails] 🚨 ALERT: ML model automatically disabled');
      console.log(`[MLGuardrails] Reason: ${reason}`);
      console.log(`[MLGuardrails] Metrics:`);
      console.log(`  - Predictions: ${metrics.predictionsTotal}`);
      console.log(`  - Errors: ${metrics.inferenceErrors}`);
      console.log(`  - Avg Confidence: ${(metrics.avgConfidence * 100).toFixed(1)}%`);
      console.log(`  - Sharpe Ratio: ${metrics.mlSharpeRatio.toFixed(2)}`);
      console.log(`  - Max Drawdown: ${(metrics.mlMaxDrawdown * 100).toFixed(1)}%`);
      
      // TODO: Send email/SMS alert
      // TODO: Post to Slack/Discord
      
      console.log('[MLGuardrails] ✅ Rollback complete. ML disabled.');
      
      // Stop monitoring since ML is now disabled
      this.stop();
    } catch (error) {
      console.error('[MLGuardrails] ❌ Error executing rollback:', error);
    }
  }
  
  /**
   * Manual rollback (for testing or emergency)
   */
  async manualRollback(reason: string = 'Manual rollback'): Promise<void> {
    await this.executeRollback(reason);
  }
  
  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; userId: string } {
    return {
      isRunning: this.isRunning,
      userId: this.userId.toString()
    };
  }
}

// Global guardrails instance (would be initialized per user in production)
let globalGuardrails: MLGuardrails | null = null;

/**
 * Initialize ML guardrails for a user
 */
export function initializeMLGuardrails(userId: mongoose.Types.ObjectId): MLGuardrails {
  if (globalGuardrails) {
    globalGuardrails.stop();
  }
  
  globalGuardrails = new MLGuardrails(userId);
  globalGuardrails.start(60);  // Check every 60 minutes
  
  return globalGuardrails;
}

/**
 * Get global guardrails instance
 */
export function getMLGuardrails(): MLGuardrails | null {
  return globalGuardrails;
}

/**
 * Stop ML guardrails
 */
export function stopMLGuardrails(): void {
  if (globalGuardrails) {
    globalGuardrails.stop();
    globalGuardrails = null;
  }
}

