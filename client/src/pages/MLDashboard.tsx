import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, Activity, CheckCircle, Loader2, AlertTriangle, Zap, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MLStatistics {
  totalModels: number;
  activeModels: number;
  trainingModels: number;
  avgAccuracy: number;
  totalPredictions: number;
  successfulPredictions: number;
  currentModel: {
    name: string;
    version: string;
    type: string;
    status: string;
    isDeployed: boolean;
    episodes: number;
    validationReward: number;
    stateSize: number;
    actionSize: number;
    lastTrainedAt: string;
    description: string;
  };
}

export default function MLDashboard() {
  const [stats, setStats] = useState<MLStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ml/statistics');
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch ML statistics');
      }
      
      setStats(result.data);
    } catch (error) {
      console.error('Error fetching ML statistics:', error);
      setError(error instanceof Error ? error.message : 'Failed to load ML data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Loading State
  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-3/4" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2 text-destructive">Failed to Load ML Dashboard</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { currentModel } = stats;
  const predictionAccuracy = stats.totalPredictions > 0 
    ? ((stats.successfulPredictions / stats.totalPredictions) * 100).toFixed(1)
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8" />
            Machine Learning Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Grid Trading PPO Reinforcement Learning Model
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1: Model Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Model Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              {currentModel.isDeployed ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300 dark:border-green-700">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Deployed
                </Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <div className="text-2xl font-bold">{currentModel.status}</div>
            <p className="text-xs text-muted-foreground">
              {currentModel.isDeployed ? 'ML-enhanced grid trading active' : 'Using rule-based signals only'}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Training Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training Episodes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentModel.episodes}</div>
            <p className="text-xs text-muted-foreground">
              Validation Reward: {currentModel.validationReward.toFixed(3)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Last trained: {new Date(currentModel.lastTrainedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Prediction Accuracy */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prediction Accuracy</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{predictionAccuracy}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalPredictions} total predictions
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.successfulPredictions} successful
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Model Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {currentModel.name}
          </CardTitle>
          <CardDescription>{currentModel.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Version</span>
                <span className="text-sm font-semibold">{currentModel.version}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Model Type</span>
                <Badge variant="outline">{currentModel.type.replace('_', ' ').toUpperCase()}</Badge>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">State Dimensions</span>
                <span className="text-sm font-semibold">{currentModel.stateSize}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Action Dimensions</span>
                <span className="text-sm font-semibold">{currentModel.actionSize}</span>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Episodes Trained</span>
                <span className="text-sm font-semibold">{currentModel.episodes}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Validation Reward</span>
                <span className="text-sm font-semibold">{currentModel.validationReward.toFixed(3)}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Deployment Status</span>
                {currentModel.isDeployed ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium text-muted-foreground">Last Trained</span>
                <span className="text-sm font-semibold">
                  {new Date(currentModel.lastTrainedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Explained Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Model Actions
          </CardTitle>
          <CardDescription>
            The PPO agent can take 5 different actions to optimize grid trading parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-lg font-bold">HOLD</div>
              <p className="text-xs text-muted-foreground mt-1">Keep current settings</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-lg font-bold">TIGHT_GRID</div>
              <p className="text-xs text-muted-foreground mt-1">Reduce grid spacing</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-lg font-bold">WIDE_GRID</div>
              <p className="text-xs text-muted-foreground mt-1">Increase grid spacing</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-lg font-bold">INCREASE_SIZE</div>
              <p className="text-xs text-muted-foreground mt-1">Larger order sizes</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-lg font-bold">DECREASE_SIZE</div>
              <p className="text-xs text-muted-foreground mt-1">Smaller order sizes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* State Features Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            State Features ({currentModel.stateSize} dimensions)
          </CardTitle>
          <CardDescription>
            Market indicators and grid metrics used by the ML model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Market Indicators (7)</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                <li>• Price</li>
                <li>• 24h Volume</li>
                <li>• Volatility (ATR-based)</li>
                <li>• Trend Strength</li>
                <li>• RSI (14-period)</li>
                <li>• Bollinger Band Width</li>
                <li>• Price vs MA20</li>
              </ul>
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Grid Metrics (8)</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                <li>• Active Orders</li>
                <li>• Buy Orders</li>
                <li>• Sell Orders</li>
                <li>• Fills (24h)</li>
                <li>• Profit (24h)</li>
                <li>• Avg Profit/Cycle</li>
                <li>• Fill Rate</li>
                <li>• Capital Utilization</li>
              </ul>
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Portfolio Context (5)</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                <li>• Playbook Activity Level</li>
                <li>• Total Exposure</li>
                <li>• Reserve Cash %</li>
                <li>• Current Drawdown</li>
                <li>• Risk Utilization</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
