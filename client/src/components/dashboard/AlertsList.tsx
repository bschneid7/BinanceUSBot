import { Alert } from '@/types/trading';
import { AlertCircle, Info, AlertTriangle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface AlertsListProps {
  alerts: Alert[];
}

export function AlertsList({ alerts }: AlertsListProps) {
  const getAlertConfig = (level: Alert['level']) => {
    const configs = {
      INFO: {
        icon: Info,
        className: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950'
      },
      WARNING: {
        icon: AlertTriangle,
        className: 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950'
      },
      ERROR: {
        icon: AlertCircle,
        className: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950'
      },
      CRITICAL: {
        icon: XCircle,
        className: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
      }
    };
    return configs[level];
  };

  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <p className="text-center text-muted-foreground py-4">No recent alerts</p>
      ) : (
        alerts.map((alert) => {
          const config = getAlertConfig(alert.level);
          const Icon = config.icon;

          return (
            <div key={alert._id} className={cn('flex items-start gap-3 p-3 rounded-lg border', config.className)}>
              <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}