import { IPosition } from '../models/Position';
import mongoose from 'mongoose';
declare class PositionService {
    /**
     * Get all active positions for a user
     * @param userId - The user ID
     * @returns Array of active positions
     */
    getActivePositions(userId: string | mongoose.Types.ObjectId): Promise<IPosition[]>;
    /**
     * Get all positions for a user (active and closed)
     * @param userId - The user ID
     * @param filters - Optional filters (status, playbook, symbol)
     * @returns Array of positions
     */
    getAllPositions(userId: string | mongoose.Types.ObjectId, filters?: {
        status?: string;
        playbook?: string;
        symbol?: string;
    }): Promise<IPosition[]>;
    /**
     * Get a single position by ID
     * @param positionId - The position ID
     * @param userId - The user ID
     * @returns The position or null
     */
    getPositionById(positionId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId): Promise<IPosition | null>;
    /**
     * Create a new position
     * @param positionData - Position data
     * @returns The created position
     */
    createPosition(positionData: Partial<IPosition>): Promise<IPosition>;
    /**
     * Update a position
     * @param positionId - The position ID
     * @param userId - The user ID
     * @param updateData - Data to update
     * @returns The updated position or null
     */
    updatePosition(positionId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId, updateData: Partial<IPosition>): Promise<IPosition | null>;
    /**
     * Delete a position
     * @param positionId - The position ID
     * @param userId - The user ID
     * @returns True if deleted, false otherwise
     */
    deletePosition(positionId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId): Promise<boolean>;
}
declare const _default: PositionService;
export default _default;
//# sourceMappingURL=positionService.d.ts.map