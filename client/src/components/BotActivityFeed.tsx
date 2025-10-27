import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ActivityEvent {
  timestamp: string;
  type: string;
  symbol?: string;
  playbook?: string;
  reason?: string;
  details?: any;
  action?: string;
}

interface BotStatus {
  botRunning: boolean;
  openPositions: number;
  maxPositions: number;
  canOpenNew: boolean;
  blockReason?: string | null;
}

interface ActivitySummary {
  signalsEvaluated: number;
  signalsRejected: number;
  signalsAccepted: number;
  lastActivityTime: string | null;
}

const BotActivityFeed: React.FC = () => {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = async () => {
    try {
      const response = await fetch('/api/bot/activity');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data.status);
        setSummary(data.data.summary);
        setActivity(data.data.recentActivity);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch activity');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signal_accepted':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'signal_rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'signal_evaluated':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'position_closed':
        return <CheckCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2">Loading bot activity...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center text-red-600">
          <AlertCircle className="w-6 h-6 mr-2" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-xl font-semibold">Bot Activity Feed</h2>
          </div>
          <button
            onClick={fetchActivity}
            className="flex items-center px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {status && (
        <div className={`p-4 ${status.canOpenNew ? 'bg-green-50' : 'bg-yellow-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${status.botRunning ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                {status.botRunning ? 'Bot Active' : 'Bot Stopped'}
              </span>
              <span className="ml-4 text-sm text-gray-600">
                Positions: {status.openPositions}/{status.maxPositions}
              </span>
            </div>
            {!status.canOpenNew && status.blockReason && (
              <span className="text-sm text-yellow-700 font-medium">
                ⚠️ {status.blockReason}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.signalsEvaluated}</div>
            <div className="text-xs text-gray-600">Signals Evaluated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.signalsRejected}</div>
            <div className="text-xs text-gray-600">Rejected</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.signalsAccepted}</div>
            <div className="text-xs text-gray-600">Accepted</div>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="p-4">
        {activity.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-sm">Bot is scanning markets...</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activity.map((event, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="mt-1">
                  {getActivityIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {event.symbol && <span className="text-blue-600">{event.symbol}</span>}
                      {event.playbook && <span className="text-gray-500 ml-2">({event.playbook})</span>}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  {event.reason && (
                    <p className="text-sm text-gray-600 mt-1">{event.reason}</p>
                  )}
                  {event.action && (
                    <p className="text-xs text-gray-500 mt-1">Action: {event.action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-gray-50 border-t text-center text-xs text-gray-500">
        Last updated: {summary?.lastActivityTime ? formatTime(summary.lastActivityTime) : 'Never'}
        <span className="mx-2">•</span>
        Auto-refreshes every 5 seconds
      </div>
    </div>
  );
};

export default BotActivityFeed;

