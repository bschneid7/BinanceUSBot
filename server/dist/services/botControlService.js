import BotConfig from '../models/BotConfig';
import Position from '../models/Position';
import Alert from '../models/Alert';
/**
 * Emergency stop - Flatten all positions and halt trading
 */
export const emergencyStop = async (userId) => {
    console.log(`[BotControlService] Emergency stop initiated for user: ${userId}`);
    try {
        // Get all open positions
        const openPositions = await Position.find({
            userId,
            status: 'OPEN'
        });
        console.log(`[BotControlService] Found ${openPositions.length} open positions to flatten`);
        // Close all open positions
        const closePromises = openPositions.map(async (position) => {
            // In a real implementation, this would:
            // 1. Submit market orders to close positions on the exchange
            // 2. Wait for fill confirmation
            // 3. Update position records with actual close prices
            // For now, we'll simulate closing at current price
            const closePrice = position.current_price || position.entry_price;
            const pnl = position.side === 'LONG'
                ? (closePrice - position.entry_price) * position.quantity
                : (position.entry_price - closePrice) * position.quantity;
            position.status = 'CLOSED';
            position.closed_at = new Date();
            position.realized_pnl = pnl;
            position.realized_r = position.unrealized_r || 0;
            await position.save();
            console.log(`[BotControlService] Flattened position ${position._id} - Symbol: ${position.symbol}, PnL: $${pnl.toFixed(2)}`);
            return position;
        });
        await Promise.all(closePromises);
        // Update bot config to STOPPED status
        const config = await BotConfig.findOne({ userId });
        if (!config) {
            throw new Error('Bot configuration not found');
        }
        config.botStatus = 'STOPPED';
        config.haltMetadata = {
            reason: 'Emergency stop executed by user',
            timestamp: new Date(),
            positionsFlattened: openPositions.length,
            justification: 'Manual emergency stop triggered'
        };
        await config.save();
        console.log(`[BotControlService] Bot status updated to STOPPED for user: ${userId}`);
        // Create critical alert
        await Alert.create({
            userId,
            level: 'CRITICAL',
            type: 'EMERGENCY_STOP',
            message: `Emergency stop executed. ${openPositions.length} positions flattened. Trading halted.`,
            timestamp: new Date()
        });
        console.log(`[BotControlService] Emergency stop alert created for user: ${userId}`);
        return {
            success: true,
            message: `Emergency stop executed. ${openPositions.length} positions flattened.`,
            positionsFlattened: openPositions.length
        };
    }
    catch (error) {
        console.error('[BotControlService] Error during emergency stop:', error);
        throw error;
    }
};
/**
 * Resume trading after halt
 */
export const resumeTrading = async (userId, justification) => {
    console.log(`[BotControlService] Resume trading initiated for user: ${userId}`);
    try {
        const config = await BotConfig.findOne({ userId });
        if (!config) {
            throw new Error('Bot configuration not found');
        }
        // Check current status
        if (config.botStatus === 'ACTIVE') {
            console.log(`[BotControlService] Bot already active for user: ${userId}`);
            return {
                success: true,
                message: 'Trading is already active',
                previousStatus: 'ACTIVE'
            };
        }
        const previousStatus = config.botStatus;
        // Update to ACTIVE
        config.botStatus = 'ACTIVE';
        config.haltMetadata = {
            reason: 'Trading resumed by user',
            timestamp: new Date(),
            justification: justification || 'Manual resume triggered'
        };
        await config.save();
        console.log(`[BotControlService] Bot status updated from ${previousStatus} to ACTIVE for user: ${userId}`);
        // Create info alert
        await Alert.create({
            userId,
            level: 'INFO',
            type: 'TRADING_RESUMED',
            message: justification
                ? `Trading resumed. Justification: ${justification}`
                : 'Trading resumed successfully',
            timestamp: new Date()
        });
        console.log(`[BotControlService] Trading resumed alert created for user: ${userId}`);
        return {
            success: true,
            message: 'Trading resumed successfully',
            previousStatus,
            justification
        };
    }
    catch (error) {
        console.error('[BotControlService] Error during trading resume:', error);
        throw error;
    }
};
/**
 * Get current bot control status
 */
export const getControlStatus = async (userId) => {
    console.log(`[BotControlService] Getting control status for user: ${userId}`);
    try {
        const config = await BotConfig.findOne({ userId });
        if (!config) {
            throw new Error('Bot configuration not found');
        }
        const openPositionsCount = await Position.countDocuments({
            userId,
            status: 'OPEN'
        });
        return {
            botStatus: config.botStatus,
            haltMetadata: config.haltMetadata,
            openPositions: openPositionsCount
        };
    }
    catch (error) {
        console.error('[BotControlService] Error getting control status:', error);
        throw error;
    }
};
export default {
    emergencyStop,
    resumeTrading,
    getControlStatus
};
//# sourceMappingURL=botControlService.js.map