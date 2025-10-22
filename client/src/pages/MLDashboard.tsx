import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { getMLModels, getMLStats, deployMLModel, archiveMLModel } from '@/api/ml';
import { trainPPO, getTrainingStatus } from '@/api/ppo';
import { Loader2, Brain, TrendingUp, Activity, CheckCircle, XCircle, Archive, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

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
  const [error, setError] = useState<string | null>(null); // Error state
  const [training, setTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<string>('');
  const { toast } = useToast();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use Promise.allSettled to allow partial loading
      const results = await Promise.allSettled([
          getMLModels(),
          getMLStats()
      ]);

      let modelsData = null;
      let statsData = null;
      let fetchError = null;

      if (results[0].status === 'fulfilled') {
          modelsData = results[0].value;
          setModels(modelsData?.models ?? []);
      } else {
          console.error('Error fetching ML models:', results[0].reason);
          fetchError = results[0].reason instanceof Error ? results[0].reason.message : 'Failed to load models list.';
          setModels([]); // Reset models on error
      }

      if (results[1].status === 'fulfilled') {
          statsData = results[1].value;
          setStats(statsData?.stats ?? null);
      } else {
          console.error('Error fetching ML stats:', results[1].reason);
          const statsError = results[1].reason instanceof Error ? results[1].reason.message : 'Failed to load ML stats.';
          fetchError = fetchError ? `${fetchError} ${statsError}` : statsError;
          setStats(null); // Reset stats on error
      }

      if (fetchError) {
          setError(fetchError);
          toast({
              title: 'Error Loading ML Data',
              description: fetchError,
              variant: 'destructive',
          });
      }

    } catch (error) { // Catch unexpected errors during setup
      console.error('Unexpected error in fetchData:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load ML data';
      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
      setModels([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [toast]); // Include toast in dependencies

  useEffect(() => {
    fetchData();
    // Check initial training status in case a training job was already running
    pollTrainingStatus();
  }, [fetchData]); // Removed pollTrainingStatus from deps, called once manually after fetch

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Poll for training status - unchanged logic, just added inside component
  const pollTrainingStatus = useCallback(async () => {
    try {
        const status = await getTrainingStatus();
        console.log("Polling training status:", status); // Add logging

        if (status.status === 'TRAINING') {
            setTraining(true); // Ensure training state is true
            const elapsed = Math.floor((status.elapsedTime || 0) / 1000);
            setTrainingProgress(`Training in progress (${status.progress || 0}%, ${elapsed}s elapsed)...`);
             // Keep polling if training
            if (!pollingIntervalRef.current) {
                pollingIntervalRef.current = setInterval(pollTrainingStatus, 3000);
            }
        } else if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'NONE') {
            // Stop polling if completed, failed, or no job exists
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
                console.log("Stopped polling training status."); // Add logging
            }
             setTraining(false); // Ensure training state is false
             setTrainingProgress('');

            if(status.status === 'COMPLETED') {
                toast({
                  title: 'Training Complete',
                  description: `Average reward: ${status.avgReward?.toFixed(2) || 'N/A'}. Duration: ${((status.duration || 0) / 1000).toFixed(1)}s`,
                });
                await fetchData(); // Refresh data
            } else if (status.status === 'FAILED') {
                 toast({
                    variant: 'destructive',
                    title: 'Training Failed',
                    description: status.error || 'Unknown error',
                 });
                 await fetchData(); // Refresh data
            }
        }

    } catch (error) {
      console.error('Error polling training status:', error);
       // Stop polling on error too
       if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
       }
       setTraining(false);
       setTrainingProgress('');
       // Optional: Show error toast if polling fails consistently?
    }
  }, [toast, fetchData]); // Dependencies

  const handleTrain = async () => {
    try {
      setTraining(true);
      setTrainingProgress('Starting training...');

      const result = await trainPPO({ episodes: 500 }); // Using 500 episodes as example

      toast({
        title: 'Training Started',
        description: `Training PPO model (ID: ${result.modelId}) in background...`,
      });

      // Start polling immediately
      pollTrainingStatus(); // Initial check
      if (!pollingIntervalRef.current) { // Start interval if not already running
          pollingIntervalRef.current = setInterval(pollTrainingStatus, 3000);
          console.log("Started polling training status."); // Add logging
      }
    } catch (error) {
      console.error('Training error:', error);
      setTraining(false);
      setTrainingProgress('');
      toast({
        variant: 'destructive',
        title: 'Error Starting Training',
        description: (error as Error).message || 'Failed to start training',
      });
    }
  };

    // handleDeploy and handleArchive remain unchanged
   const handleDeploy = async (modelId: string) => {
     setLoading(true); // Add loading indicator for deploy/archive actions
     try {
       await deployMLModel(modelId);
       toast({
         title: 'Success',
         description: 'Model deployment initiated',
       });
       await fetchData(); // Refresh data after action
     } catch (error) {
       console.error('Deploy error:', error);
       toast({
         variant: 'destructive',
         title: 'Deployment Error',
         description: (error as Error).message || 'Failed to deploy model',
       });
     } finally {
       setLoading(false);
     }
   };

   const handleArchive = async (modelId: string) => {
     setLoading(true);
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
         title: 'Archive Error',
         description: (error as Error).message || 'Failed to archive model',
       });
     } finally {
       setLoading(false);
     }
   };


  // getStatusBadge remains unchanged
   const getStatusBadge = (status: string, isDeployed: boolean) => {
    if (isDeployed)
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300 dark:border-green-700">
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
        return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-300 dark:border-blue-700">Active</Badge>;
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
        return <Badge variant="secondary">{status}</Badge>;
    }
  };


  // --- Render Logic ---

  // 1. Loading State
  if (loading && !models.length && !stats) { // Show full page loader only on initial load
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-3/4" /> {/* Title Skeleton */}
         <div className="grid gap-4 md:grid-cols-3">
             {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)} {/* Stats Skeleton */}
         </div>
         <Skeleton className="h-64" /> {/* Models List Skeleton */}
      </div>
    );
  }

  // 2. Error State
  if (error) {
     return (
       <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
         <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
         <h2 className="text-2xl font-semibold mb-2 text-destructive">Failed to Load ML Dashboard</h2>
         <p className="text-muted-foreground mb-4">{error}</p>
         <Button onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
           Retry Loading
         </Button>
       </div>
     );
  }

  // 3. Success State (potentially with partial data if stats failed but models loaded)
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
            Manage and monitor PPO Reinforcement Learning models.
          </p>
        </div>
        <Button onClick={handleTrain} disabled={training || loading} className="w-full md:w-auto">
          {training ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {trainingProgress || 'Training...'}
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              Train New Model (500 episodes)
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards - Conditionally render based on stats availability */}
      {stats ? (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Card 1: Total Models */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalModels}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeModels} active, {stats.trainingModels} training, {stats.failedModels} failed
              </p>
            </CardContent>
          </Card>
          {/* Card 2: Deployed Model */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deployed Model</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.deployedModels > 0 ? '1' : '0'}</div>
              <p className="text-xs text-muted-foreground">
                {stats.deployedModels > 0 ? 'ML-enhanced trading active' : 'Using rule-based signals only'}
              </p>
            </CardContent>
          </Card>
          {/* Card 3: Best Model Performance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Best Model (by Reward)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.bestModel ? (
                <>
                  <div className="text-2xl font-bold">
                    Reward: {stats.bestModel.avgReward.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate" title={stats.bestModel.version}>
                     Version: {stats.bestModel.version}
                  </p>
                   <p className="text-xs text-muted-foreground">
                     Backtest WR: {stats.bestModel.backtestWinRate?.toFixed(1) ?? 'N/A'}%
                   </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">-</div>
                  <p className="text-xs text-muted-foreground">No active models trained yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
          <Card className="text-center py-8">
              <CardContent>
                  <p className="text-muted-foreground">Could not load model statistics.</p>
              </CardContent>
          </Card>
      )}

      {/* Models List */}
      <Card>
        <CardHeader>
          <CardTitle>ML Models</CardTitle>
          <CardDescription>
            List of trained models. Deploy an 'Active' model to enable ML-enhanced trading.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {models.length === 0 && !loading ? ( // Show 'No models' only if not loading
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No models found</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Train your first AI model to get started.
              </p>
              <Button onClick={handleTrain} disabled={training || loading}>
                 {training ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Train First Model
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {models.map(model => (
                <Card key={model._id} className={model.isDeployed ? "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-950/30" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                      {/* Model Info */}
                      <div className="space-y-1 flex-grow">
                        <div className="flex flex-wrap items-center gap-2">
                           <h3 className="font-semibold text-lg">{model.version}</h3>
                           {getStatusBadge(model.status, model.isDeployed)}
                           <Badge variant="outline">{model.modelType}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                           <p>Episodes: {model.episodes} | Avg Reward: {model.avgReward?.toFixed(2) ?? 'N/A'}</p>
                           {/* Backtest Performance */}
                           {(model.performance?.backtestWinRate !== undefined || model.performance?.backtestProfitFactor !== undefined) && (
                               <p>
                                   Backtest:{' '}
                                   {model.performance.backtestWinRate !== undefined ? `${model.performance.backtestWinRate.toFixed(1)}% WR` : 'N/A WR'}
                                   {' '}•{' '}
                                   {model.performance.backtestProfitFactor !== undefined ? `${model.performance.backtestProfitFactor.toFixed(2)} PF` : 'N/A PF'}
                                    {' '}•{' '}
                                   {model.performance.backtestTotalTrades ?? 'N/A'} Trades
                               </p>
                           )}
                           {/* Live Performance */}
                           {(model.performance?.liveWinRate !== undefined || model.performance?.liveTotalTrades !== undefined) && (
                               <p>
                                   Live:{' '}
                                   {model.performance.liveWinRate !== undefined ? `${model.performance.liveWinRate.toFixed(1)}% WR` : 'N/A WR'}
                                   {' '}•{' '}
                                   {model.performance.liveProfitFactor !== undefined ? `${model.performance.liveProfitFactor.toFixed(2)} PF` : 'N/A PF'}
                                   {' '}•{' '}
                                   {model.performance.liveTotalTrades ?? 'N/A'} Trades
                               </p>
                           )}
                           <p>Created: {new Date(model.createdAt).toLocaleString()}</p>
                           {model.deployedAt && <p>Deployed: {new Date(model.deployedAt).toLocaleString()}</p>}
                        </div>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-shrink-0 mt-2 sm:mt-0">
                        {model.status === 'ACTIVE' && !model.isDeployed && (
                          <Button
                            size="sm"
                            onClick={() => handleDeploy(model._id)}
                            disabled={loading || training} // Disable if loading data or training
                          >
                             {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                            Deploy
                          </Button>
                        )}
                         {model.status !== 'ARCHIVED' && model.status !== 'TRAINING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleArchive(model._id)}
                            disabled={loading || training || model.isDeployed} // Disable if deployed
                          >
                            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Archive className="mr-1 h-4 w-4" />}
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

