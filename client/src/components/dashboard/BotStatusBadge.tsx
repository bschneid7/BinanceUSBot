import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, XCircle } from 'lucide-react';

interface BotStatusBadgeProps {
  status: 'ACTIVE' | 'HALTED' | 'HALTED_WEEKLY';
}

export function BotStatusBadge({ status }: BotStatusBadgeProps) {
  const config = {
    ACTIVE: {
      label: 'Active',
      icon: Activity,
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    },
    HALTED: {
      label: 'Halted (Daily)',
      icon: AlertTriangle,
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    },
    HALTED_WEEKLY: {
      label: 'Halted (Weekly)',
      icon: XCircle,
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }
  };

  const { label, icon: Icon, className } = config[status];

  return (
    <Badge className={className}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}