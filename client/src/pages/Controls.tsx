import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { emergencyStop, resumeTrading } from '@/api/trading';
import { useToast } from '@/hooks/useToast';
import { AlertTriangle, Play, XCircle } from 'lucide-react';

export function Controls() {
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleEmergencyStop = async () => {
    setLoading(true);
    try {
      const response = await emergencyStop();
      toast({
        title: 'Emergency Stop Executed',
        description: response.message
      });
    } catch (error: unknown) {
      console.error('Error executing emergency stop:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute emergency stop';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!justification.trim()) {
      toast({
        title: 'Justification Required',
        description: 'Please provide a justification for resuming trading',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const response = await resumeTrading(justification);
      toast({
        title: 'Trading Resumed',
        description: response.message
      });
      setJustification('');
    } catch (error: unknown) {
      console.error('Error resuming trading:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to resume trading';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-8 w-8" />
          Manual Controls
        </h1>
        <p className="text-muted-foreground">Emergency controls and manual overrides</p>
      </div>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-900 dark:text-red-100 flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Emergency Kill Switch
          </CardTitle>
          <CardDescription>Immediately flatten all positions and halt trading</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Warning:</strong> This action will:
              </p>
              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-200 mt-2 space-y-1 ml-4">
                <li>Close all open positions immediately using market orders</li>
                <li>Halt all trading operations</li>
                <li>Prevent new signals from being executed</li>
                <li>Require manual intervention to resume</li>
              </ul>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="lg" className="w-full" disabled={loading}>
                  <XCircle className="h-5 w-5 mr-2" />
                  Execute Emergency Stop
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white dark:bg-gray-950">
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will immediately close all open positions and halt trading. This action cannot be undone and may result in slippage losses.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEmergencyStop} className="bg-red-600 hover:bg-red-700">
                    Confirm Emergency Stop
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card className="border-green-200 dark:border-green-900">
        <CardHeader>
          <CardTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
            <Play className="h-5 w-5" />
            Resume Trading
          </CardTitle>
          <CardDescription>Resume trading operations after a halt</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Note:</strong> Trading can only be resumed if:
              </p>
              <ul className="list-disc list-inside text-sm text-green-800 dark:text-green-200 mt-2 space-y-1 ml-4">
                <li>Weekly loss limit has not been breached</li>
                <li>A valid justification is provided</li>
                <li>System health checks pass</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="justification">Justification (Required)</Label>
              <Textarea
                id="justification"
                placeholder="Explain why trading should be resumed..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            <Button variant="default" size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={handleResume} disabled={loading || !justification.trim()}>
              <Play className="h-5 w-5 mr-2" />
              Resume Trading
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automated Kill-Switch Status</CardTitle>
          <CardDescription>Current status of automated risk limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Daily Loss Limit</p>
                <p className="text-sm text-muted-foreground">Triggers at -2.0R</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">Auto-resume next session</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Weekly Loss Limit</p>
                <p className="text-sm text-muted-foreground">Triggers at -6.0R</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">Requires manual reset</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Max Open Risk</p>
                <p className="text-sm text-muted-foreground">Limit: 2.0R</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">Blocks new signals</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}