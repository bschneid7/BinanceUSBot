import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square, AlertTriangle, Settings, Activity } from 'lucide-react';

interface BotStatus {
    isActive: boolean;
    totalEquity: number;
    openPositions: number;
    lastUpdate: string;
}

export const BotControlPanel: React.FC = () => {
    const queryClient = useQueryClient();
    const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

    // Fetch bot status
    const { data: status, isLoading } = useQuery<{ success: boolean; data: BotStatus }>({
        queryKey: ['botStatus'],
        queryFn: async () => {
            const res = await fetch('/api/control/bot/status');
            return res.json();
        },
        refetchInterval: 5000 // Refresh every 5 seconds
    });

    // Start bot mutation
    const startBot = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/control/bot/start', { method: 'POST' });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['botStatus'] });
        }
    });

    // Stop bot mutation
    const stopBot = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/control/bot/stop', { method: 'POST' });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['botStatus'] });
        }
    });

    // Emergency stop mutation
    const emergencyStop = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/control/bot/emergency-stop', { method: 'POST' });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['botStatus'] });
            setShowEmergencyConfirm(false);
        }
    });

    if (isLoading || !status) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-24 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    const botStatus = status.data;
    const isActive = botStatus.isActive;

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Activity className={`w-6 h-6 ${isActive ? 'text-green-500' : 'text-gray-400'}`} />
                    <h2 className="text-2xl font-bold">Bot Control</h2>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                }`}>
                    {isActive ? 'ACTIVE' : 'STOPPED'}
                </div>
            </div>

            {/* Bot Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Equity</div>
                    <div className="text-2xl font-bold">${botStatus.totalEquity.toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Open Positions</div>
                    <div className="text-2xl font-bold">{botStatus.openPositions}</div>
                </div>
            </div>

            {/* Control Buttons */}
            <div className="space-y-3">
                {!isActive ? (
                    <button
                        onClick={() => startBot.mutate()}
                        disabled={startBot.isPending}
                        className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        <Play className="w-5 h-5" />
                        {startBot.isPending ? 'Starting...' : 'Start Bot'}
                    </button>
                ) : (
                    <button
                        onClick={() => stopBot.mutate()}
                        disabled={stopBot.isPending}
                        className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        <Square className="w-5 h-5" />
                        {stopBot.isPending ? 'Stopping...' : 'Stop Bot'}
                    </button>
                )}

                {/* Emergency Stop */}
                {!showEmergencyConfirm ? (
                    <button
                        onClick={() => setShowEmergencyConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        <AlertTriangle className="w-5 h-5" />
                        Emergency Stop
                    </button>
                ) : (
                    <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
                        <div className="text-red-800 font-semibold mb-2">⚠️ Confirm Emergency Stop</div>
                        <div className="text-sm text-red-700 mb-3">
                            This will immediately close all {botStatus.openPositions} open positions and stop the bot.
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => emergencyStop.mutate()}
                                disabled={emergencyStop.isPending}
                                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded transition-colors"
                            >
                                {emergencyStop.isPending ? 'Executing...' : 'Confirm Stop'}
                            </button>
                            <button
                                onClick={() => setShowEmergencyConfirm(false)}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Status Messages */}
            {startBot.isSuccess && (
                <div className="mt-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                    ✅ Bot started successfully
                </div>
            )}
            {stopBot.isSuccess && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                    ⏸️ Bot stopped successfully
                </div>
            )}
            {emergencyStop.isSuccess && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                    🛑 Emergency stop executed - all positions closed
                </div>
            )}
        </div>
    );
};

export default BotControlPanel;
