import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class DashboardWebSocket {
    private io: SocketIOServer;
    private connectedClients: Set<string> = new Set();

    constructor(httpServer: HTTPServer) {
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: process.env.DASHBOARD_URL || '*',
                methods: ['GET', 'POST']
            },
            path: '/dashboard-socket'
        });

        this.setupEventHandlers();
        console.log('[DashboardWebSocket] WebSocket server initialized');
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`[DashboardWebSocket] Client connected: ${socket.id}`);
            this.connectedClients.add(socket.id);

            // Handle subscription
            socket.on('subscribe', (data: { channels: string[] }) => {
                console.log(`[DashboardWebSocket] Client ${socket.id} subscribed to:`, data.channels);
                data.channels.forEach(channel => {
                    socket.join(channel);
                });
            });

            // Handle unsubscribe
            socket.on('unsubscribe', (data: { channels: string[] }) => {
                console.log(`[DashboardWebSocket] Client ${socket.id} unsubscribed from:`, data.channels);
                data.channels.forEach(channel => {
                    socket.leave(channel);
                });
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`[DashboardWebSocket] Client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });

            // Send initial connection success
            socket.emit('connected', {
                clientId: socket.id,
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Broadcast position update
     */
    public broadcastPositionUpdate(position: any) {
        this.io.to('positions').emit('position:update', {
            type: 'position:update',
            data: position,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast trade execution
     */
    public broadcastTradeExecuted(trade: any) {
        this.io.to('trades').emit('trade:executed', {
            type: 'trade:executed',
            data: trade,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast ML prediction
     */
    public broadcastMLPrediction(prediction: any) {
        this.io.to('ml').emit('ml:prediction', {
            type: 'ml:prediction',
            data: prediction,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast risk alert
     */
    public broadcastRiskAlert(alert: any) {
        this.io.to('risk').emit('risk:alert', {
            type: 'risk:alert',
            data: alert,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast bot status change
     */
    public broadcastBotStatus(status: { isActive: boolean; reason?: string }) {
        this.io.emit('bot:status', {
            type: 'bot:status',
            data: status,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast equity update
     */
    public broadcastEquityUpdate(equity: { total: number; change: number; changePercent: number }) {
        this.io.to('overview').emit('equity:update', {
            type: 'equity:update',
            data: equity,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast signal generated
     */
    public broadcastSignal(signal: any) {
        this.io.to('signals').emit('signal:generated', {
            type: 'signal:generated',
            data: signal,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast anomaly detected
     */
    public broadcastAnomaly(anomaly: any) {
        this.io.to('ml').emit('anomaly:detected', {
            type: 'anomaly:detected',
            data: anomaly,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcast regime change
     */
    public broadcastRegimeChange(regime: { old: string; new: string; confidence: number }) {
        this.io.to('ml').emit('regime:change', {
            type: 'regime:change',
            data: regime,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get connected clients count
     */
    public getConnectedClientsCount(): number {
        return this.connectedClients.size;
    }

    /**
     * Get Socket.IO instance (for external use)
     */
    public getIO(): SocketIOServer {
        return this.io;
    }
}

// Singleton instance
let dashboardWebSocket: DashboardWebSocket | null = null;

export function initializeDashboardWebSocket(httpServer: HTTPServer): DashboardWebSocket {
    if (!dashboardWebSocket) {
        dashboardWebSocket = new DashboardWebSocket(httpServer);
    }
    return dashboardWebSocket;
}

export function getDashboardWebSocket(): DashboardWebSocket | null {
    return dashboardWebSocket;
}

