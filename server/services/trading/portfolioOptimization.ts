import binanceService from '../binanceService';

interface Asset {
  symbol: string;
  currentWeight: number; // Current % of portfolio
  targetWeight: number; // Optimal % of portfolio
  valueUSD: number;
  returns: number[];
  volatility: number;
  correlation: Map<string, number>;
}

interface PortfolioMetrics {
  totalValue: number;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  diversificationScore: number;
}

interface RebalanceAction {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  amountUSD: number;
  currentWeight: number;
  targetWeight: number;
  reason: string;
}

/**
 * Portfolio Optimization Service
 * Uses Modern Portfolio Theory to optimize asset allocation
 */
export class PortfolioOptimization {
  private readonly MIN_POSITION_WEIGHT = 2; // Minimum 2% per position
  private readonly MAX_POSITION_WEIGHT = 15; // Maximum 15% per position
  private readonly TARGET_POSITIONS = 10; // Target number of positions
  private readonly REBALANCE_THRESHOLD = 3; // Rebalance if drift > 3%

  /**
   * Analyze current portfolio and generate optimization recommendations
   */
  async analyzePortfolio(): Promise<{
    currentMetrics: PortfolioMetrics;
    optimizedMetrics: PortfolioMetrics;
    rebalanceActions: RebalanceAction[];
  }> {
    console.log('[PortfolioOptimization] Analyzing portfolio...');

    // Get current positions
    const positions = await this.getCurrentPositions();
    const totalValue = await this.getTotalEquity();

    if (positions.length === 0) {
      console.log('[PortfolioOptimization] No positions to optimize');
      return {
        currentMetrics: this.getEmptyMetrics(),
        optimizedMetrics: this.getEmptyMetrics(),
        rebalanceActions: [],
      };
    }

    // Build asset data with historical returns
    const assets = await this.buildAssetData(positions, totalValue);

    // Calculate current portfolio metrics
    const currentMetrics = this.calculatePortfolioMetrics(assets);

    // Optimize portfolio allocation
    const optimizedAssets = this.optimizeAllocation(assets);

    // Calculate optimized portfolio metrics
    const optimizedMetrics = this.calculatePortfolioMetrics(optimizedAssets);

    // Generate rebalance actions
    const rebalanceActions = this.generateRebalanceActions(assets, optimizedAssets, totalValue);

    return {
      currentMetrics,
      optimizedMetrics,
      rebalanceActions,
    };
  }

  /**
   * Build asset data with historical returns and correlations
   */
  private async buildAssetData(positions: any[], totalValue: number): Promise<Asset[]> {
    const assets: Asset[] = [];

    for (const position of positions) {
      try {
        // Get historical price data (30 days)
        const klines = await binanceService.getKlines(position.symbol, '1d', 30);
        if (!klines || klines.length < 7) continue;

        const closes = klines.map((k: any) => parseFloat(k[4]));

        // Calculate daily returns
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }

        // Calculate volatility
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);

        const currentWeight = (position.valueUSD / totalValue) * 100;

        assets.push({
          symbol: position.symbol,
          currentWeight,
          targetWeight: currentWeight, // Will be optimized
          valueUSD: position.valueUSD,
          returns,
          volatility,
          correlation: new Map(),
        });

      } catch (error) {
        console.error(`[PortfolioOptimization] Error building asset data for ${position.symbol}:`, error);
      }
    }

    // Calculate correlations between assets
    this.calculateCorrelations(assets);

    return assets;
  }

  /**
   * Calculate correlation matrix between all assets
   */
  private calculateCorrelations(assets: Asset[]): void {
    for (let i = 0; i < assets.length; i++) {
      for (let j = 0; j < assets.length; j++) {
        if (i === j) {
          assets[i].correlation.set(assets[j].symbol, 1.0);
          continue;
        }

        const correlation = this.calculateCorrelation(
          assets[i].returns,
          assets[j].returns
        );

        assets[i].correlation.set(assets[j].symbol, correlation);
      }
    }
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 2) return 0;

    const mean1 = returns1.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sum1 = 0;
    let sum2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      numerator += diff1 * diff2;
      sum1 += diff1 * diff1;
      sum2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(sum1 * sum2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Optimize portfolio allocation using simplified Markowitz model
   */
  private optimizeAllocation(assets: Asset[]): Asset[] {
    console.log('[PortfolioOptimization] Optimizing allocation...');

    // Equal weight baseline
    const equalWeight = 100 / assets.length;

    // Adjust weights based on risk-return profile
    const optimizedAssets = assets.map(asset => {
      let targetWeight = equalWeight;

      // Adjust for volatility (lower volatility = higher weight)
      const avgVolatility = assets.reduce((sum, a) => sum + a.volatility, 0) / assets.length;
      const volatilityAdjustment = (avgVolatility / asset.volatility) - 1;
      targetWeight *= (1 + volatilityAdjustment * 0.3);

      // Adjust for returns (higher returns = higher weight)
      const avgReturn = assets.reduce((sum, a) => {
        const assetReturn = a.returns.reduce((s, r) => s + r, 0) / a.returns.length;
        return sum + assetReturn;
      }, 0) / assets.length;

      const assetReturn = asset.returns.reduce((s, r) => s + r, 0) / asset.returns.length;
      const returnAdjustment = (assetReturn / avgReturn) - 1;
      targetWeight *= (1 + returnAdjustment * 0.3);

      // Adjust for diversification (lower correlation = higher weight)
      const avgCorrelation = Array.from(asset.correlation.values())
        .filter(c => c !== 1.0)
        .reduce((sum, c) => sum + Math.abs(c), 0) / (asset.correlation.size - 1);

      const diversificationAdjustment = 1 - avgCorrelation;
      targetWeight *= (1 + diversificationAdjustment * 0.2);

      // Apply min/max constraints
      targetWeight = Math.max(this.MIN_POSITION_WEIGHT, Math.min(this.MAX_POSITION_WEIGHT, targetWeight));

      return {
        ...asset,
        targetWeight,
      };
    });

    // Normalize weights to sum to 100%
    const totalWeight = optimizedAssets.reduce((sum, a) => sum + a.targetWeight, 0);
    optimizedAssets.forEach(asset => {
      asset.targetWeight = (asset.targetWeight / totalWeight) * 100;
    });

    return optimizedAssets;
  }

  /**
   * Calculate portfolio metrics
   */
  private calculatePortfolioMetrics(assets: Asset[]): PortfolioMetrics {
    if (assets.length === 0) return this.getEmptyMetrics();

    const totalValue = assets.reduce((sum, a) => sum + a.valueUSD, 0);

    // Calculate weighted average return
    const expectedReturn = assets.reduce((sum, asset) => {
      const assetReturn = asset.returns.reduce((s, r) => s + r, 0) / asset.returns.length;
      return sum + (assetReturn * asset.targetWeight / 100);
    }, 0);

    // Calculate portfolio volatility (simplified)
    let portfolioVariance = 0;

    for (const asset1 of assets) {
      for (const asset2 of assets) {
        const weight1 = asset1.targetWeight / 100;
        const weight2 = asset2.targetWeight / 100;
        const correlation = asset1.correlation.get(asset2.symbol) || 0;

        portfolioVariance += weight1 * weight2 * asset1.volatility * asset2.volatility * correlation;
      }
    }

    const volatility = Math.sqrt(portfolioVariance);

    // Calculate Sharpe ratio (assuming 0% risk-free rate)
    const sharpeRatio = volatility > 0 ? expectedReturn / volatility : 0;

    // Calculate diversification score
    const avgCorrelation = this.calculateAverageCorrelation(assets);
    const diversificationScore = (1 - avgCorrelation) * 100;

    return {
      totalValue,
      expectedReturn: expectedReturn * 100, // Convert to percentage
      volatility: volatility * 100, // Convert to percentage
      sharpeRatio,
      diversificationScore,
    };
  }

  /**
   * Calculate average correlation across portfolio
   */
  private calculateAverageCorrelation(assets: Asset[]): number {
    if (assets.length < 2) return 0;

    let totalCorrelation = 0;
    let count = 0;

    for (const asset of assets) {
      const correlations = Array.from(asset.correlation.values()).filter(c => c !== 1.0);
      totalCorrelation += correlations.reduce((sum, c) => sum + Math.abs(c), 0);
      count += correlations.length;
    }

    return count > 0 ? totalCorrelation / count : 0;
  }

  /**
   * Generate rebalance actions
   */
  private generateRebalanceActions(
    currentAssets: Asset[],
    optimizedAssets: Asset[],
    totalValue: number
  ): RebalanceAction[] {
    const actions: RebalanceAction[] = [];

    for (const optimized of optimizedAssets) {
      const current = currentAssets.find(a => a.symbol === optimized.symbol);
      if (!current) continue;

      const drift = Math.abs(optimized.targetWeight - current.currentWeight);

      // Only rebalance if drift exceeds threshold
      if (drift < this.REBALANCE_THRESHOLD) {
        actions.push({
          symbol: optimized.symbol,
          action: 'HOLD',
          amountUSD: 0,
          currentWeight: current.currentWeight,
          targetWeight: optimized.targetWeight,
          reason: `Drift ${drift.toFixed(1)}% is below ${this.REBALANCE_THRESHOLD}% threshold`,
        });
        continue;
      }

      const targetValueUSD = (optimized.targetWeight / 100) * totalValue;
      const amountUSD = Math.abs(targetValueUSD - current.valueUSD);

      if (optimized.targetWeight > current.currentWeight) {
        actions.push({
          symbol: optimized.symbol,
          action: 'BUY',
          amountUSD,
          currentWeight: current.currentWeight,
          targetWeight: optimized.targetWeight,
          reason: `Underweight by ${drift.toFixed(1)}%. Target: ${optimized.targetWeight.toFixed(1)}%`,
        });
      } else {
        actions.push({
          symbol: optimized.symbol,
          action: 'SELL',
          amountUSD,
          currentWeight: current.currentWeight,
          targetWeight: optimized.targetWeight,
          reason: `Overweight by ${drift.toFixed(1)}%. Target: ${optimized.targetWeight.toFixed(1)}%`,
        });
      }
    }

    // Sort by amount (largest first)
    actions.sort((a, b) => b.amountUSD - a.amountUSD);

    return actions;
  }

  /**
   * Get current positions from database
   */
  private async getCurrentPositions(): Promise<any[]> {
    try {
      const response = await fetch('http://localhost:3000/api/positions');
      const data = await response.json();
      return data.positions || [];
    } catch (error) {
      console.error('[PortfolioOptimization] Error fetching positions:', error);
      return [];
    }
  }

  /**
   * Get total account equity
   */
  private async getTotalEquity(): Promise<number> {
    try {
      const response = await fetch('http://localhost:3000/api/account/equity');
      const data = await response.json();
      return data.totalEquity || 0;
    } catch (error) {
      console.error('[PortfolioOptimization] Error fetching equity:', error);
      return 0;
    }
  }

  /**
   * Get empty metrics object
   */
  private getEmptyMetrics(): PortfolioMetrics {
    return {
      totalValue: 0,
      expectedReturn: 0,
      volatility: 0,
      sharpeRatio: 0,
      diversificationScore: 0,
    };
  }

  /**
   * Check if portfolio needs rebalancing
   */
  async needsRebalancing(): Promise<boolean> {
    const analysis = await this.analyzePortfolio();
    return analysis.rebalanceActions.some(action => action.action !== 'HOLD');
  }

  /**
   * Execute portfolio rebalancing
   */
  async executeRebalancing(): Promise<void> {
    console.log('[PortfolioOptimization] Executing portfolio rebalancing...');

    const analysis = await this.analyzePortfolio();

    for (const action of analysis.rebalanceActions) {
      if (action.action === 'HOLD') continue;

      console.log(`[PortfolioOptimization] ${action.action} ${action.symbol}: $${action.amountUSD.toFixed(2)} - ${action.reason}`);

      // Execute rebalance action via message queue
      try {
        await fetch('http://localhost:3000/api/queue/rebalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: action.symbol,
            action: action.action,
            amountUSD: action.amountUSD,
            reason: action.reason,
          }),
        });
      } catch (error) {
        console.error(`[PortfolioOptimization] Error executing rebalance for ${action.symbol}:`, error);
      }
    }

    console.log('[PortfolioOptimization] Rebalancing complete');
  }
}

// Singleton instance
export const portfolioOptimization = new PortfolioOptimization();
