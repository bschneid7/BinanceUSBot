import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Activity, History, BarChart3, Settings, FileText, AlertTriangle, Brain } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Positions', href: '/positions', icon: Activity },
  { name: 'Trade History', href: '/trades', icon: History },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'ML Dashboard', href: '/ml', icon: Brain },
  { name: 'Configuration', href: '/config', icon: Settings },
  { name: 'Tax Reports', href: '/tax', icon: FileText },
  { name: 'Controls', href: '/controls', icon: AlertTriangle }
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-lg font-bold">Trading Bot</h2>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}