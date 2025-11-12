import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';

interface TradeValidation {
    mlConfidence: number;
    portfolioHeat: number;
    maxPositionsReached: boolean;
    sufficientBalance: boolean;
    correlationRisk: string;
    warnings: string[];
    recommendation: 'APPROVED' | 'CAUTION' | 'NOT_RECOMMENDED';
    suggestedSize: number;
}

export const ManualTradePanel: React.FC = () => {
    const queryClient = useQueryClient();
    const [symbol, setSymbol] = useState('BTCUSDT');
    const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
    const [quantity, setQuantity] = useState('0.01');
    const [price, setPrice] = useState('');
    const [stopLoss, setStopLoss] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [validation, setValidation] = useState<TradeValidation | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);

    // Fetch available symbols
    const { data: symbolsData } = useQuery({
        queryKey: ['symbols'],
        queryFn: async () => {
            const res = await fetch('/api/manual-trade/symbols');
            return res.json();
        }
    });

    // Validate trade mutation
    const validateTrade = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/manual-trade/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol,
                    side,
                    quantity: parseFloat(quantity),
                    price: price ? parseFloat(price) : undefined
                })
            });
            return res.json();
        },
        onSuccess: (data) => {
            setValidation(data.data);
        }
    });

    // Execute trade mutation
    const executeTrade = useMutation({
        mutationFn: async (force: boolean = false) => {
            const res = await fetch('/api/manual-trade/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol,
                    side,
                    orderType,
                    quantity: parseFloat(quantity),
                    price: price ? parseFloat(price) : undefined,
                    stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
                    takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
                    force
                })
            });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                queryClient.invalidateQueries({ queryKey: ['positions'] });
                queryClient.invalidateQueries({ queryKey: ['botStatus'] });
                // Reset form
                setQuantity('0.01');
                setPrice('');
                setStopLoss('');
                setTakeProfit('');
                setValidation(null);
                setShowConfirmation(false);
            } else if (data.requiresConfirmation) {
                setShowConfirmation(true);
            }
        }
    });

    const handleValidate = () => {
        validateTrade.mutate();
    };

    const handleExecute = (force: boolean = false) => {
        executeTrade.mutate(force);
    };

    const symbols = symbolsData?.data || [];

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-6">Manual Trading</h2>

            {/* Trade Form */}
            <div className="space-y-4">
                {/* Symbol Selection */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Symbol
                    </label>
                    <select
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {symbols.map((s: any) => (
                            <option key={s.symbol} value={s.symbol}>
                                {s.symbol} - ${s.price.toLocaleString()}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Side Selection */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Side
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSide('BUY')}
                            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors ${
                                side === 'BUY'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <TrendingUp className="w-5 h-5" />
                            BUY / LONG
                        </button>
                        <button
                            onClick={() => setSide('SELL')}
                            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors ${
                                side === 'SELL'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <TrendingDown className="w-5 h-5" />
                            SELL / SHORT
                        </button>
                    </div>
                </div>

                {/* Order Type */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Order Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setOrderType('MARKET')}
                            className={`py-2 rounded-lg font-semibold transition-colors ${
                                orderType === 'MARKET'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Market
                        </button>
                        <button
                            onClick={() => setOrderType('LIMIT')}
                            className={`py-2 rounded-lg font-semibold transition-colors ${
                                orderType === 'LIMIT'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            Limit
                        </button>
                    </div>
                </div>

                {/* Quantity */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Quantity
                    </label>
                    <input
                        type="number"
                        step="0.001"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0.01"
                    />
                </div>

                {/* Price (for limit orders) */}
                {orderType === 'LIMIT' && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Limit Price
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="50000"
                        />
                    </div>
                )}

                {/* Stop Loss & Take Profit */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Stop Loss (Optional)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Auto"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Take Profit (Optional)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Auto"
                        />
                    </div>
                </div>

                {/* Validate Button */}
                <button
                    onClick={handleValidate}
                    disabled={validateTrade.isPending || !quantity}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                    {validateTrade.isPending ? 'Validating...' : 'Validate Trade'}
                </button>

                {/* Validation Results */}
                {validation && (
                    <div className={`border-2 rounded-lg p-4 ${
                        validation.recommendation === 'APPROVED' ? 'border-green-500 bg-green-50' :
                        validation.recommendation === 'CAUTION' ? 'border-yellow-500 bg-yellow-50' :
                        'border-red-500 bg-red-50'
                    }`}>
                        <div className="flex items-center gap-2 mb-3">
                            {validation.recommendation === 'APPROVED' ? (
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            ) : (
                                <AlertCircle className="w-6 h-6 text-yellow-600" />
                            )}
                            <div className="font-bold text-lg">
                                {validation.recommendation === 'APPROVED' && 'Trade Approved'}
                                {validation.recommendation === 'CAUTION' && 'Trade with Caution'}
                                {validation.recommendation === 'NOT_RECOMMENDED' && 'Not Recommended'}
                            </div>
                        </div>

                        {/* Validation Metrics */}
                        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                            <div>
                                <div className="text-gray-600">ML Confidence</div>
                                <div className={`font-semibold ${
                                    validation.mlConfidence >= 0.7 ? 'text-green-600' :
                                    validation.mlConfidence >= 0.5 ? 'text-yellow-600' :
                                    'text-red-600'
                                }`}>
                                    {(validation.mlConfidence * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-600">Portfolio Heat</div>
                                <div className={`font-semibold ${
                                    validation.portfolioHeat <= 0.2 ? 'text-green-600' :
                                    validation.portfolioHeat <= 0.3 ? 'text-yellow-600' :
                                    'text-red-600'
                                }`}>
                                    {(validation.portfolioHeat * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-600">Balance Check</div>
                                <div className={`font-semibold ${
                                    validation.sufficientBalance ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {validation.sufficientBalance ? 'Sufficient' : 'Insufficient'}
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-600">Correlation Risk</div>
                                <div className={`font-semibold ${
                                    validation.correlationRisk === 'LOW' ? 'text-green-600' :
                                    validation.correlationRisk === 'MEDIUM' ? 'text-yellow-600' :
                                    'text-red-600'
                                }`}>
                                    {validation.correlationRisk}
                                </div>
                            </div>
                        </div>

                        {/* Warnings */}
                        {validation.warnings.length > 0 && (
                            <div className="bg-white rounded p-3 mb-3">
                                <div className="text-sm font-semibold text-gray-700 mb-1">⚠️ Warnings:</div>
                                <ul className="text-sm text-gray-600 list-disc list-inside">
                                    {validation.warnings.map((warning, i) => (
                                        <li key={i}>{warning}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Suggested Size */}
                        {validation.suggestedSize !== parseFloat(quantity) && (
                            <div className="bg-white rounded p-3 mb-3 text-sm">
                                <span className="text-gray-600">Suggested size: </span>
                                <span className="font-semibold">{validation.suggestedSize}</span>
                                <button
                                    onClick={() => setQuantity(validation.suggestedSize.toString())}
                                    className="ml-2 text-blue-500 hover:text-blue-700 font-semibold"
                                >
                                    Apply
                                </button>
                            </div>
                        )}

                        {/* Execute Button */}
                        <button
                            onClick={() => handleExecute(false)}
                            disabled={executeTrade.isPending}
                            className={`w-full font-semibold py-3 rounded-lg transition-colors ${
                                validation.recommendation === 'NOT_RECOMMENDED'
                                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                    : side === 'BUY'
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-red-500 hover:bg-red-600 text-white'
                            }`}
                        >
                            {executeTrade.isPending ? 'Executing...' : `Execute ${side} Order`}
                        </button>
                    </div>
                )}

                {/* Low Confidence Confirmation */}
                {showConfirmation && (
                    <div className="border-2 border-orange-500 bg-orange-50 rounded-lg p-4">
                        <div className="font-bold text-orange-900 mb-2">⚠️ Low ML Confidence</div>
                        <div className="text-sm text-orange-800 mb-3">
                            This trade has low ML confidence and may have higher risk. Do you want to proceed anyway?
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleExecute(true)}
                                disabled={executeTrade.isPending}
                                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded transition-colors"
                            >
                                {executeTrade.isPending ? 'Executing...' : 'Force Execute'}
                            </button>
                            <button
                                onClick={() => setShowConfirmation(false)}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 rounded transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Success Message */}
                {executeTrade.isSuccess && executeTrade.data.success && (
                    <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                        ✅ Trade executed successfully!
                    </div>
                )}
            </div>
        </div>
    );
};


export default ManualTradePanel;

