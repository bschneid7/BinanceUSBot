import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { getMLModels, getMLStats, deployMLModel, archiveMLModel } from '@/api/ml';
import { trainPPO, getPPOStats } from '@/api/ppo';
import { Loader2, Brain, TrendingUp, Activity, CheckCircle, XCircle, Archive } from 'lucide-react';

interface MLModel {
  _id: string;
  modelType: string;
  version: string;
  status: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';
  episodes: number;
  avgReward: number;
  isDeployed: boolean;
  deployedAt?: string;
  performance: {
    backtestWinRate?: number;
    backtestProfitFactor?: number;
    liveWinRate?: number;
    liveProfitFactor?: number;
    liveTotalTrades?: number;
  };
  createdAt: string;
}

interface MLStats {
  totalModels: number;
  activeModels: number;
  deployedModels: number;
  trainingModels: number;
  archivedModels: number;
  failedModels: number;
  bestModel?: {
    id: string;
    version: string;
    avgReward: number;
    backtestWinRate?: number;
    liveWinRate?: number;
  };
}

export default function MLDashboard() {
  const [models, setModels] = useState<MLModel[]>([]);
  const [stats, setStats] = useState<MLStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [modelsData, statsData] = await Promise.all([getMLModels(), getMLStats()]);
      setModels(modelsData.models);
      setStats(statsData.stats);
    } catch (error) {
      console.error('Error fetching ML data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error).message || 'Failed to load ML data',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrain = async () => {
    try {
      setTraining(true);
      toast({
        title: 'Training Started',
        description: 'Training PPO model with 500 episodes...',
      });

      const result = await trainPPO({ episodes: 500 });

      toast({
        title: 'Training Complete',
        description: `Average reward: ${result.avgReward.toFixed(2)}`,
      });

      await fetchData(); // Refresh data
    } catch (error) {
      console.error('Training error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error).message || 'Training failed',
      });
    } finally {
      setTraining(false);
    }
  };

  const handleDeploy = async (modelId: string) => {
    try {
      await deployMLModel(modelId);
      toast({
        title: 'Success',
        description: 'Model deployed successfully',
      });
      await fetchData();
    } catch (error) {
      console.error('Deploy error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error).message || 'Failed to deploy model',
      });
    }
  };

  const handleArchive = async (modelId: string) => {
    try {
      await archiveMLModel(modelId);
      toast({
        title: 'Success',
        description: 'Model archived successfully',
      });
      await fetchData();
    } catch (error) {
      console.error('Archive error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error).message || 'Failed to archive model',
      });
    }
  };

  const getStatusBadge = (status: string, isDeployed: boolean) => {
    if (isDeployed)
      return (
        <Badge className="bg-green-500">
          <CheckCircle className="mr-1 h-3 w-3" />
          Deployed
        </Badge>
      );

    switch (status) {
      case 'TRAINING':
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Training
          </Badge>
        );
      case 'ACTIVE':
        return <Badge variant="default">Active</Badge>;
      case 'ARCHIVED':
        return <Badge variant="outline">Archived</Badge>;
      case 'FAILED':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Machine Learning Dashboard</h1>
          <p className="text-muted-foreground">
            Manage and monitor your AI trading models (PPO Reinforcement Learning)
          </p>
        </div>
        <Button onClick={handleTrain} disabled={training}>
          {training ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Training...
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              Train New Model
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalModels}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeModels} active, {stats.archivedModels} archived
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deployed Model</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.deployedModels}</div>
              <p className="text-xs text-muted-foreground">
                {stats.deployedModels > 0 ? 'ML-enhanced trading active' : 'Using rule-based only'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Best Model Performance</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.bestModel ? (
                <>
                  <div className="text-2xl font-bold">
                    {stats.bestModel.backtestWinRate?.toFixed(1) || 'N/A'}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Win rate • Reward: {stats.bestModel.avgReward.toFixed(2)}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">-</div>
                  <p className="text-xs text-muted-foreground">No models trained yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Models List */}
      <Card>
        <CardHeader>
          <CardTitle>ML Models</CardTitle>
          <CardDescription>
            Manage your trained reinforcement learning models
          </CardDescription>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No models found</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Train your first AI model to get started with ML-enhanced trading
              </p>
              <Button onClick={handleTrain} disabled={training}>
                <Brain className="mr-2 h-4 w-4" />
                Train Model
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {models.map(model => (
                <Card key={model._id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{model.version}</h3>
                          {getStatusBadge(model.status, model.isDeployed)}
                          <Badge variant="outline">{model.modelType}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div>Episodes: {model.episodes} • Avg Reward: {model.avgReward.toFixed(2)}</div>
                          {model.performance.backtestWinRate && (
                            <div>
                              Backtest: {model.performance.backtestWinRate.toFixed(1)}% WR •{' '}
                              {model.performance.backtestProfitFactor?.toFixed(2)} PF
                            </div>
                          )}
                          {model.performance.liveWinRate && (
                            <div>
                              Live: {model.performance.liveWinRate.toFixed(1)}% WR •{' '}
                              {model.performance.liveTotalTrades} trades
                            </div>
                          )}
                          <div>Created: {new Date(model.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {model.status === 'ACTIVE' && !model.isDeployed && (
                          <Button
                            size="sm"
                            onClick={() => handleDeploy(model._id)}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Deploy
                          </Button>
                        )}
                        {model.status === 'ACTIVE' && model.isDeployed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleArchive(model._id)}
                          >
                            <Archive className="mr-1 h-4 w-4" />
                            Archive
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
