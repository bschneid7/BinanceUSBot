import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface GridTradingData {
  overview: {
    totalOrders: number;
    openOrders: number;
    filledOrders: number;
    successRate: string;
  };
  performance: {
    totalVolume: string;
    totalFees: string;
    totalProfit: string;
    avgProfitPerCycle: string;
    completedCycles: number;
    netProfit: string;
  };
  symbols: Array<{
    symbol: string;
    activeOrders: number;
  }>;
  activity: {
    lastHour: {
      newOrders: number;
      fills: number;
    };
    latestOrder: {
      symbol: string;
      side: string;
      price: number;
      time: string;
    } | null;
    minutesSinceActivity: number;
  };
  health: {
    status: 'HEALTHY' | 'WARNING' | 'ERROR';
    message: string;
    isActive: boolean;
  };
  recentTransactions: Array<{
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    total: number;
    fees: number;
    timestamp: string;
    orderId: string;
  }>;
}

const GridTradingDashboard: React.FC = () => {
  const [data, setData] = useState<GridTradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    fetchGridTradingData();
    const interval = setInterval(fetchGridTradingData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchGridTradingData = async () => {
    try {
      const response = await axios.get('/api/dashboard/grid-trading');
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch grid trading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid-trading-dashboard loading">
        <p>Loading grid trading data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid-trading-dashboard error">
        <p>Failed to load grid trading data</p>
      </div>
    );
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return '#10b981';
      case 'WARNING': return '#f59e0b';
      case 'ERROR': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="grid-trading-dashboard">
      {/* Header with Explanation Toggle */}
      <div className="dashboard-header">
        <h2>📊 Grid Trading</h2>
        <button 
          className="info-button"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          {showExplanation ? '✕ Hide' : 'ℹ️ What is this?'}
        </button>
      </div>

      {/* Explanation Panel */}
      {showExplanation && (
        <div className="explanation-panel">
          <h3>🎓 What is Grid Trading?</h3>
          <p>
            Grid trading is an <strong>automated strategy</strong> that profits from price oscillations 
            by placing <strong>buy and sell orders</strong> at predetermined price levels (the "grid").
          </p>
          
          <h4>How It Works:</h4>
          <ol>
            <li><strong>Place buy orders</strong> below the current price (e.g., BTC @ $113,000)</li>
            <li><strong>Place sell orders</strong> above the current price (e.g., BTC @ $113,800)</li>
            <li>When a <strong>buy order fills</strong>, automatically place a sell order above it</li>
            <li>When a <strong>sell order fills</strong>, automatically place a buy order below it</li>
            <li><strong>Profit from the spread</strong> between buy and sell prices ($800 in this example)</li>
          </ol>

          <h4>Key Benefits:</h4>
          <ul>
            <li>✅ <strong>Fully automated</strong> - No manual intervention needed</li>
            <li>✅ <strong>Works in sideways markets</strong> - Profits from price oscillations</li>
            <li>✅ <strong>Low risk per trade</strong> - Many small profits add up over time</li>
            <li>✅ <strong>Complements your positions</strong> - Runs alongside your 6 directional trades</li>
          </ul>

          <h4>Understanding the Metrics:</h4>
          <ul>
            <li><strong>Active Orders:</strong> Buy/sell limit orders currently on Binance waiting to fill</li>
            <li><strong>Filled Orders:</strong> Orders that executed successfully</li>
            <li><strong>Completed Cycles:</strong> Full buy→sell pairs that generated profit</li>
            <li><strong>Net Profit:</strong> Total profit minus fees from all grid trading</li>
            <li><strong>Avg Profit/Cycle:</strong> Average profit per completed buy→sell pair</li>
          </ul>
        </div>
      )}

      {/* Health Status Banner */}
      <div 
        className="health-banner" 
        style={{ 
          backgroundColor: getHealthColor(data.health.status),
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>{data.health.status}</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px' }}>{data.health.message}</p>
          </div>
          {data.activity.latestOrder && (
            <div style={{ textAlign: 'right', fontSize: '12px' }}>
              <div>Latest: {data.activity.latestOrder.symbol} {data.activity.latestOrder.side}</div>
              <div>{data.activity.minutesSinceActivity}m ago</div>
            </div>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Active Orders</div>
          <div className="metric-value">{data.overview.openOrders}</div>
          <div className="metric-subtitle">
            Limit orders on Binance
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Filled Orders</div>
          <div className="metric-value">{data.overview.filledOrders}</div>
          <div className="metric-subtitle">
            Successfully executed
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Completed Cycles</div>
          <div className="metric-value">{data.performance.completedCycles}</div>
          <div className="metric-subtitle">
            Buy→Sell pairs
          </div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-label">Net Profit</div>
          <div className="metric-value" style={{ color: '#10b981' }}>
            ${data.performance.netProfit}
          </div>
          <div className="metric-subtitle">
            Total profit - fees
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="performance-section">
        <h3>📈 Performance</h3>
        <div className="performance-grid">
          <div className="performance-item">
            <span className="label">Total Volume:</span>
            <span className="value">${data.performance.totalVolume}</span>
          </div>
          <div className="performance-item">
            <span className="label">Total Fees:</span>
            <span className="value">${data.performance.totalFees}</span>
          </div>
          <div className="performance-item">
            <span className="label">Gross Profit:</span>
            <span className="value">${data.performance.totalProfit}</span>
          </div>
          <div className="performance-item">
            <span className="label">Avg Profit/Cycle:</span>
            <span className="value">${data.performance.avgProfitPerCycle}</span>
          </div>
        </div>
      </div>

      {/* Active Grids by Symbol */}
      <div className="symbols-section">
        <h3>🎯 Active Grids by Symbol</h3>
        <div className="symbols-list">
          {data.symbols.map(s => (
            <div key={s.symbol} className="symbol-item">
              <span className="symbol-name">{s.symbol}</span>
              <span className="symbol-count">{s.activeOrders} orders</span>
              <div className="symbol-bar">
                <div 
                  className="symbol-bar-fill" 
                  style={{ 
                    width: `${(s.activeOrders / data.overview.openOrders) * 100}%`,
                    backgroundColor: '#3b82f6'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h3>⚡ Recent Activity (Last Hour)</h3>
        <div className="activity-stats">
          <div className="activity-stat">
            <div className="activity-number">{data.activity.lastHour.newOrders}</div>
            <div className="activity-label">New Orders Placed</div>
          </div>
          <div className="activity-stat">
            <div className="activity-number">{data.activity.lastHour.fills}</div>
            <div className="activity-label">Orders Filled</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="transactions-section">
        <h3>📋 Recent Grid Transactions</h3>
        <div className="transactions-table-container">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
                <th>Fees</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((tx, idx) => (
                <tr key={idx}>
                  <td>{new Date(tx.timestamp).toLocaleString()}</td>
                  <td><strong>{tx.symbol}</strong></td>
                  <td>
                    <span className={`side-badge ${tx.side.toLowerCase()}`}>
                      {tx.side}
                    </span>
                  </td>
                  <td>{tx.quantity.toFixed(4)}</td>
                  <td>${tx.price.toFixed(2)}</td>
                  <td>${tx.total.toFixed(2)}</td>
                  <td>${tx.fees.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .grid-trading-dashboard {
          padding: 20px;
          background: #f9fafb;
          border-radius: 12px;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .dashboard-header h2 {
          margin: 0;
          font-size: 24px;
          color: #111827;
        }

        .info-button {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .info-button:hover {
          background: #2563eb;
        }

        .explanation-panel {
          background: #fff;
          border: 2px solid #3b82f6;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .explanation-panel h3 {
          margin-top: 0;
          color: #1f2937;
        }

        .explanation-panel h4 {
          margin-top: 16px;
          margin-bottom: 8px;
          color: #374151;
        }

        .explanation-panel p {
          line-height: 1.6;
          color: #4b5563;
        }

        .explanation-panel ol, .explanation-panel ul {
          line-height: 1.8;
          color: #4b5563;
        }

        .explanation-panel li {
          margin-bottom: 8px;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .metric-card {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .metric-card.highlight {
          border: 2px solid #10b981;
        }

        .metric-label {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .metric-value {
          font-size: 32px;
          font-weight: bold;
          color: #111827;
          margin-bottom: 4px;
        }

        .metric-subtitle {
          font-size: 12px;
          color: #9ca3af;
        }

        .performance-section, .symbols-section, .activity-section, .transactions-section {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .performance-section h3, .symbols-section h3, .activity-section h3, .transactions-section h3 {
          margin-top: 0;
          margin-bottom: 16px;
          color: #111827;
        }

        .performance-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .performance-item {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .performance-item .label {
          color: #6b7280;
          font-size: 14px;
        }

        .performance-item .value {
          font-weight: bold;
          color: #111827;
        }

        .symbols-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .symbol-item {
          display: grid;
          grid-template-columns: 100px 100px 1fr;
          align-items: center;
          gap: 12px;
        }

        .symbol-name {
          font-weight: bold;
          color: #111827;
        }

        .symbol-count {
          color: #6b7280;
          font-size: 14px;
        }

        .symbol-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .symbol-bar-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .activity-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
        }

        .activity-stat {
          text-align: center;
          padding: 16px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .activity-number {
          font-size: 36px;
          font-weight: bold;
          color: #3b82f6;
        }

        .activity-label {
          font-size: 14px;
          color: #6b7280;
          margin-top: 4px;
        }

        .transactions-table-container {
          overflow-x: auto;
        }

        .transactions-table {
          width: 100%;
          border-collapse: collapse;
        }

        .transactions-table th {
          text-align: left;
          padding: 12px;
          background: #f9fafb;
          color: #6b7280;
          font-weight: 600;
          font-size: 14px;
          border-bottom: 2px solid #e5e7eb;
        }

        .transactions-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 14px;
          color: #111827;
        }

        .transactions-table tr:hover {
          background: #f9fafb;
        }

        .side-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        }

        .side-badge.buy {
          background: #d1fae5;
          color: #065f46;
        }

        .side-badge.sell {
          background: #fee2e2;
          color: #991b1b;
        }
      `}</style>
    </div>
  );
};

export default GridTradingDashboard;

