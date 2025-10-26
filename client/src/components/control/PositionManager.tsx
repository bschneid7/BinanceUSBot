import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, TrendingUp, TrendingDown, Edit, ScaleIcon } from 'lucide-react';

interface Position {
    _id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
    unrealizedPnL: number;
    playbook: string;
    status: string;
}

interface PositionCardProps {
    position: Position;
}

const PositionCard: React.FC<PositionCardProps> = ({ position }) => {
    const queryClient = useQueryClient();
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showEditSL, setShowEditSL] = useState(false);
    const [showEditTP, setShowEditTP] = useState(false);
    const [showScale, setShowScale] = useState(false);
    const [newStopLoss, setNewStopLoss] = useState(position.stopLoss.toString());
    const [newTakeProfit, setNewTakeProfit] = useState(position.takeProfit.toString());
    const [scalePercentage, setScalePercentage] = useState('50');

    // Close position mutation
    const closePosition = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/positions/${position._id}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'MANUAL_CLOSE' })
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] });
            setShowCloseConfirm(false);
        }
    });

    // Update stop loss mutation
    const updateStopLoss = useMutation({
        mutationFn: async (stopLoss: number) => {
            const res = await fetch(`/api/positions/${position._id}/stop-loss`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stopLoss })
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] });
            setShowEditSL(false);
        }
    });

    // Update take profit mutation
    const updateTakeProfit = useMutation({
        mutationFn: async (takeProfit: number) => {
            const res = await fetch(`/api/positions/${position._id}/take-profit`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ takeProfit })
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] });
            setShowEditTP(false);
        }
    });

    // Scale position mutation
    const scalePosition = useMutation({
        mutationFn: async ({ action, percentage }: { action: 'IN' | 'OUT'; percentage: number }) => {
            const res = await fetch(`/api/positions/${position._id}/scale`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, percentage })
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] });
            setShowScale(false);
        }
    });

    const isProfitable = position.unrealizedPnL > 0;

    return (
        <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{position.symbol}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        position.side === 'BUY' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                    }`}>
                        {position.side}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                        {position.playbook}
                    </span>
                </div>
                {!showCloseConfirm && (
                    <button
                        onClick={() => setShowCloseConfirm(true)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Position Details */}
            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                    <div className="text-gray-600">Entry Price</div>
                    <div className="font-semibold">${position.entryPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-gray-600">Quantity</div>
                    <div className="font-semibold">{position.quantity}</div>
                </div>
                <div>
                    <div className="text-gray-600 flex items-center gap-1">
                        Stop Loss
                        {!showEditSL && (
                            <button
                                onClick={() => setShowEditSL(true)}
                                className="text-blue-500 hover:text-blue-700"
                            >
                                <Edit className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {showEditSL ? (
                        <div className="flex gap-1">
                            <input
                                type="number"
                                value={newStopLoss}
                                onChange={(e) => setNewStopLoss(e.target.value)}
                                className="w-20 px-1 py-0.5 border rounded text-sm"
                            />
                            <button
                                onClick={() => updateStopLoss.mutate(parseFloat(newStopLoss))}
                                className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs"
                            >
                                ✓
                            </button>
                            <button
                                onClick={() => setShowEditSL(false)}
                                className="px-2 py-0.5 bg-gray-200 rounded text-xs"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="font-semibold">${position.stopLoss.toLocaleString()}</div>
                    )}
                </div>
                <div>
                    <div className="text-gray-600 flex items-center gap-1">
                        Take Profit
                        {!showEditTP && (
                            <button
                                onClick={() => setShowEditTP(true)}
                                className="text-blue-500 hover:text-blue-700"
                            >
                                <Edit className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {showEditTP ? (
                        <div className="flex gap-1">
                            <input
                                type="number"
                                value={newTakeProfit}
                                onChange={(e) => setNewTakeProfit(e.target.value)}
                                className="w-20 px-1 py-0.5 border rounded text-sm"
                            />
                            <button
                                onClick={() => updateTakeProfit.mutate(parseFloat(newTakeProfit))}
                                className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs"
                            >
                                ✓
                            </button>
                            <button
                                onClick={() => setShowEditTP(false)}
                                className="px-2 py-0.5 bg-gray-200 rounded text-xs"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="font-semibold">${position.takeProfit.toLocaleString()}</div>
                    )}
                </div>
            </div>

            {/* P&L */}
            <div className={`flex items-center gap-2 mb-3 p-2 rounded ${
                isProfitable ? 'bg-green-50' : 'bg-red-50'
            }`}>
                {isProfitable ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                )}
                <div>
                    <div className="text-xs text-gray-600">Unrealized P&L</div>
                    <div className={`text-lg font-bold ${
                        isProfitable ? 'text-green-600' : 'text-red-600'
                    }`}>
                        ${position.unrealizedPnL.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            {!showCloseConfirm && !showScale && (
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowScale(true)}
                        className="flex-1 flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 rounded transition-colors"
                    >
                        <ScaleIcon className="w-4 h-4" />
                        Scale
                    </button>
                </div>
            )}

            {/* Scale Controls */}
            {showScale && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                    <div className="text-sm font-semibold text-blue-900">Scale Position</div>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="10"
                            max="100"
                            step="10"
                            value={scalePercentage}
                            onChange={(e) => setScalePercentage(e.target.value)}
                            className="flex-1"
                        />
                        <span className="text-sm font-semibold w-12">{scalePercentage}%</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => scalePosition.mutate({ 
                                action: 'OUT', 
                                percentage: parseFloat(scalePercentage) 
                            })}
                            disabled={scalePosition.isPending}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
                        >
                            Scale Out
                        </button>
                        <button
                            onClick={() => scalePosition.mutate({ 
                                action: 'IN', 
                                percentage: parseFloat(scalePercentage) 
                            })}
                            disabled={scalePosition.isPending}
                            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
                        >
                            Scale In
                        </button>
                    </div>
                    <button
                        onClick={() => setShowScale(false)}
                        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold py-1.5 rounded transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Close Confirmation */}
            {showCloseConfirm && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                    <div className="text-sm font-semibold text-red-900 mb-2">Close Position?</div>
                    <div className="text-xs text-red-700 mb-3">
                        Current P&L: ${position.unrealizedPnL.toFixed(2)}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => closePosition.mutate()}
                            disabled={closePosition.isPending}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
                        >
                            {closePosition.isPending ? 'Closing...' : 'Confirm'}
                        </button>
                        <button
                            onClick={() => setShowCloseConfirm(false)}
                            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold py-1.5 rounded transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const PositionManager: React.FC = () => {
    const queryClient = useQueryClient();

    // Fetch positions
    const { data: positions, isLoading } = useQuery<{ success: boolean; data: Position[] }>({
        queryKey: ['positions'],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/positions');
            return res.json();
        },
        refetchInterval: 5000
    });

    // Close all positions mutation
    const closeAllPositions = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/positions/close-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'MANUAL_CLOSE_ALL' })
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
    });

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-32 bg-gray-200 rounded"></div>
                    <div className="h-32 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    const openPositions = positions?.data || [];
    const totalPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Open Positions</h2>
                    <div className="text-sm text-gray-600 mt-1">
                        {openPositions.length} active • Total P&L: 
                        <span className={`font-semibold ml-1 ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${totalPnL.toFixed(2)}
                        </span>
                    </div>
                </div>
                {openPositions.length > 0 && (
                    <button
                        onClick={() => closeAllPositions.mutate()}
                        disabled={closeAllPositions.isPending}
                        className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
                    >
                        {closeAllPositions.isPending ? 'Closing All...' : 'Close All'}
                    </button>
                )}
            </div>

            {openPositions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-2">📊</div>
                    <div className="font-semibold">No open positions</div>
                    <div className="text-sm">Positions will appear here when the bot opens trades</div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {openPositions.map((position) => (
                        <PositionCard key={position._id} position={position} />
                    ))}
                </div>
            )}
        </div>
    );
};


export default PositionManager;

