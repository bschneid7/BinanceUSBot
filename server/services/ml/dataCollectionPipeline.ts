/**
 * Data Collection Pipeline
 * Automatically collects and preprocesses trading data for ML model training
 * Ensures high-quality training data is always available
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import Trade from '../../models/Trade';
import Position from '../../models/Position';
import { CandleData } from './patternRecognition';

export interface TrainingDataPoint {
  // Input features
  features: {
    // Price action
    priceChange1h: number;
    priceChange4h: number;
    priceChange24h: number;
    volatility: number;
    
    // Volume
    volumeRatio: number;
    volumeTrend: number;
    
    // Technical indicators
    rsi: number;
    macd: number;
    macdSignal: number;
    bbPosition: number;
    
    // Market structure
    trendStrength: number;
    supportDistance: number;
    resistanceDistance: number;
    
    // Time features
    hourOfDay: number;
    dayOfWeek: number;
    
    // Signal quality
    signalAge: number;
    priceDeviation: number;
    
    // ML scores (if available)
    mlScore?: number;
    mlConfidence?: number;
    regime?: string;
  };
  
  // Target variable
  outcome: {
    wasWinner: boolean;
    pnl: number;
    pnlPercent: number;
    holdingPeriod: number;
  };
  
  // Metadata
  metadata: {
    symbol: string;
    entryTime: Date;
    exitTime: Date;
    side: 'BUY' | 'SELL';
  };
}

export interface DatasetStats {
  totalSamples: number;
  winRate: number;
  avgPnl: number;
  symbolDistribution: Map<string, number>;
  timeRange: { start: Date; end: Date };
  featureStats: {
    [key: string]: {
      min: number;
      max: number;
      mean: number;
      std: number;
    };
  };
}

class DataCollectionPipeline {
  private static instance: DataCollectionPipeline;
  private collectionInterval?: NodeJS.Timeout;
  private readonly COLLECTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  private constructor() {
    logger.info('[DataCollectionPipeline] Initialized');
  }

  static getInstance(): DataCollectionPipeline {
    if (!DataCollectionPipeline.instance) {
      DataCollectionPipeline.instance = new DataCollectionPipeline();
    }
    return DataCollectionPipeline.instance;
  }

  /**
   * Start automatic data collection
   */
  start(): void {
    if (this.collectionInterval) {
      logger.warn('[DataCollectionPipeline] Already running');
      return;
    }

    logger.info('[DataCollectionPipeline] Starting automatic data collection');

    // Run immediately
    this.collectData().catch(error => {
      logger.error('[DataCollectionPipeline] Error in initial collection:', error);
    });

    // Then run periodically
    this.collectionInterval = setInterval(() => {
      this.collectData().catch(error => {
        logger.error('[DataCollectionPipeline] Error in periodic collection:', error);
      });
    }, this.COLLECTION_INTERVAL_MS);
  }

  /**
   * Stop automatic data collection
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
      logger.info('[DataCollectionPipeline] Stopped automatic data collection');
    }
  }

  /**
   * Collect training data from recent trades
   */
  async collectData(lookbackDays: number = 30): Promise<TrainingDataPoint[]> {
    try {
      logger.info(`[DataCollectionPipeline] Collecting data from last ${lookbackDays} days`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      // Get all closed positions from the lookback period
      const positions = await Position.find({
        exitTime: { $gte: startDate },
        status: 'CLOSED'
      }).sort({ exitTime: -1 });

      logger.info(`[DataCollectionPipeline] Found ${positions.length} closed positions`);

      const trainingData: TrainingDataPoint[] = [];

      for (const position of positions) {
        try {
          const dataPoint = await this.createTrainingDataPoint(position);
          if (dataPoint) {
            trainingData.push(dataPoint);
          }
        } catch (error) {
          logger.error(`[DataCollectionPipeline] Error creating data point for position ${position._id}:`, error);
        }
      }

      logger.info(`[DataCollectionPipeline] Created ${trainingData.length} training data points`);

      // Update metrics
      metricsService.setGauge('training_data_points', trainingData.length);
      metricsService.setGauge('training_data_win_rate', 
        trainingData.filter(d => d.outcome.wasWinner).length / trainingData.length
      );

      return trainingData;
    } catch (error: any) {
      logger.error('[DataCollectionPipeline] Error collecting data:', error);
      return [];
    }
  }

  /**
   * Create a training data point from a position
   */
  private async createTrainingDataPoint(position: any): Promise<TrainingDataPoint | null> {
    try {
      // Calculate outcome
      const pnl = position.realizedPnl || 0;
      const pnlPercent = position.realizedPnlPercent || 0;
      const wasWinner = pnl > 0;
      const holdingPeriod = position.exitTime && position.entryTime
        ? (position.exitTime.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60)
        : 0;

      // Extract features (these would ideally be stored with the position)
      // For now, we'll use placeholder values
      // In production, you'd want to store market data at entry time
      const features = {
        priceChange1h: 0,
        priceChange4h: 0,
        priceChange24h: 0,
        volatility: 0,
        volumeRatio: 1.0,
        volumeTrend: 0,
        rsi: 50,
        macd: 0,
        macdSignal: 0,
        bbPosition: 0.5,
        trendStrength: 0,
        supportDistance: 0,
        resistanceDistance: 0,
        hourOfDay: position.entryTime ? position.entryTime.getUTCHours() : 0,
        dayOfWeek: position.entryTime ? position.entryTime.getUTCDay() : 0,
        signalAge: 0,
        priceDeviation: 0,
        mlScore: position.mlScore,
        mlConfidence: position.mlConfidence,
        regime: position.regime
      };

      const dataPoint: TrainingDataPoint = {
        features,
        outcome: {
          wasWinner,
          pnl,
          pnlPercent,
          holdingPeriod
        },
        metadata: {
          symbol: position.symbol,
          entryTime: position.entryTime,
          exitTime: position.exitTime,
          side: position.side
        }
      };

      return dataPoint;
    } catch (error) {
      logger.error('[DataCollectionPipeline] Error creating training data point:', error);
      return null;
    }
  }

  /**
   * Calculate dataset statistics
   */
  calculateStats(data: TrainingDataPoint[]): DatasetStats {
    if (data.length === 0) {
      return {
        totalSamples: 0,
        winRate: 0,
        avgPnl: 0,
        symbolDistribution: new Map(),
        timeRange: { start: new Date(), end: new Date() },
        featureStats: {}
      };
    }

    // Basic stats
    const totalSamples = data.length;
    const winners = data.filter(d => d.outcome.wasWinner);
    const winRate = winners.length / totalSamples;
    const avgPnl = data.reduce((sum, d) => sum + d.outcome.pnl, 0) / totalSamples;

    // Symbol distribution
    const symbolDistribution = new Map<string, number>();
    for (const point of data) {
      const count = symbolDistribution.get(point.metadata.symbol) || 0;
      symbolDistribution.set(point.metadata.symbol, count + 1);
    }

    // Time range
    const times = data.map(d => d.metadata.entryTime.getTime());
    const timeRange = {
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times))
    };

    // Feature statistics
    const featureStats: DatasetStats['featureStats'] = {};
    const featureKeys = Object.keys(data[0].features).filter(k => 
      typeof data[0].features[k as keyof typeof data[0].features] === 'number'
    );

    for (const key of featureKeys) {
      const values = data.map(d => d.features[key as keyof typeof d.features] as number).filter(v => !isNaN(v));
      
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const std = Math.sqrt(variance);

        featureStats[key] = { min, max, mean, std };
      }
    }

    return {
      totalSamples,
      winRate,
      avgPnl,
      symbolDistribution,
      timeRange,
      featureStats
    };
  }

  /**
   * Export training data to JSON
   */
  exportToJSON(data: TrainingDataPoint[], filePath: string): void {
    try {
      const fs = require('fs');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger.info(`[DataCollectionPipeline] Exported ${data.length} data points to ${filePath}`);
    } catch (error) {
      logger.error('[DataCollectionPipeline] Error exporting data:', error);
    }
  }

  /**
   * Export training data to CSV
   */
  exportToCSV(data: TrainingDataPoint[], filePath: string): void {
    try {
      const fs = require('fs');
      
      // Create header
      const featureKeys = Object.keys(data[0].features);
      const outcomeKeys = Object.keys(data[0].outcome);
      const metadataKeys = Object.keys(data[0].metadata);
      
      const header = [
        ...featureKeys.map(k => `feature_${k}`),
        ...outcomeKeys.map(k => `outcome_${k}`),
        ...metadataKeys.map(k => `metadata_${k}`)
      ].join(',');

      // Create rows
      const rows = data.map(point => {
        const featureValues = featureKeys.map(k => point.features[k as keyof typeof point.features]);
        const outcomeValues = outcomeKeys.map(k => point.outcome[k as keyof typeof point.outcome]);
        const metadataValues = metadataKeys.map(k => {
          const val = point.metadata[k as keyof typeof point.metadata];
          return val instanceof Date ? val.toISOString() : val;
        });
        
        return [...featureValues, ...outcomeValues, ...metadataValues].join(',');
      });

      const csv = [header, ...rows].join('\n');
      fs.writeFileSync(filePath, csv);
      
      logger.info(`[DataCollectionPipeline] Exported ${data.length} data points to ${filePath}`);
    } catch (error) {
      logger.error('[DataCollectionPipeline] Error exporting CSV:', error);
    }
  }

  /**
   * Split data into train/validation/test sets
   */
  splitData(
    data: TrainingDataPoint[],
    trainRatio: number = 0.7,
    valRatio: number = 0.15
  ): {
    train: TrainingDataPoint[];
    validation: TrainingDataPoint[];
    test: TrainingDataPoint[];
  } {
    // Shuffle data
    const shuffled = [...data].sort(() => Math.random() - 0.5);

    const trainSize = Math.floor(shuffled.length * trainRatio);
    const valSize = Math.floor(shuffled.length * valRatio);

    return {
      train: shuffled.slice(0, trainSize),
      validation: shuffled.slice(trainSize, trainSize + valSize),
      test: shuffled.slice(trainSize + valSize)
    };
  }

  /**
   * Balance dataset (equal winners and losers)
   */
  balanceDataset(data: TrainingDataPoint[]): TrainingDataPoint[] {
    const winners = data.filter(d => d.outcome.wasWinner);
    const losers = data.filter(d => !d.outcome.wasWinner);

    const minCount = Math.min(winners.length, losers.length);

    return [
      ...winners.slice(0, minCount),
      ...losers.slice(0, minCount)
    ].sort(() => Math.random() - 0.5);
  }
}

export const dataCollectionPipeline = DataCollectionPipeline.getInstance();
