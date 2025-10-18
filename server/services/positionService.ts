import Position, { IPosition } from '../models/Position';
import mongoose from 'mongoose';

class PositionService {
  /**
   * Get all active positions for a user
   * @param userId - The user ID
   * @returns Array of active positions
   */
  async getActivePositions(userId: string | mongoose.Types.ObjectId): Promise<IPosition[]> {
    try {
      console.log(`[PositionService] Fetching active positions for user: ${userId}`);

      const positions = await Position.find({
        userId: new mongoose.Types.ObjectId(userId),
        status: 'OPEN'
      }).sort({ opened_at: -1 });

      console.log(`[PositionService] Found ${positions.length} active positions`);
      return positions;
    } catch (error) {
      console.error(`[PositionService] Error fetching active positions:`, error);
      throw error;
    }
  }

  /**
   * Get all positions for a user (active and closed)
   * @param userId - The user ID
   * @param filters - Optional filters (status, playbook, symbol)
   * @returns Array of positions
   */
  async getAllPositions(
    userId: string | mongoose.Types.ObjectId,
    filters?: { status?: string; playbook?: string; symbol?: string }
  ): Promise<IPosition[]> {
    try {
      console.log(`[PositionService] Fetching all positions for user: ${userId}`, filters);

      const query: Record<string, string | mongoose.Types.ObjectId> = {
        userId: new mongoose.Types.ObjectId(userId),
      };

      if (filters?.status) {
        query.status = filters.status;
      }
      if (filters?.playbook) {
        query.playbook = filters.playbook;
      }
      if (filters?.symbol) {
        query.symbol = filters.symbol;
      }

      const positions = await Position.find(query).sort({ opened_at: -1 });

      console.log(`[PositionService] Found ${positions.length} positions`);
      return positions;
    } catch (error) {
      console.error(`[PositionService] Error fetching positions:`, error);
      throw error;
    }
  }

  /**
   * Get a single position by ID
   * @param positionId - The position ID
   * @param userId - The user ID
   * @returns The position or null
   */
  async getPositionById(
    positionId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IPosition | null> {
    try {
      console.log(`[PositionService] Fetching position: ${positionId} for user: ${userId}`);

      const position = await Position.findOne({
        _id: new mongoose.Types.ObjectId(positionId),
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!position) {
        console.log(`[PositionService] Position not found`);
      }

      return position;
    } catch (error) {
      console.error(`[PositionService] Error fetching position:`, error);
      throw error;
    }
  }

  /**
   * Create a new position
   * @param positionData - Position data
   * @returns The created position
   */
  async createPosition(positionData: Partial<IPosition>): Promise<IPosition> {
    try {
      console.log(`[PositionService] Creating new position:`, positionData);

      const position = new Position(positionData);
      await position.save();

      console.log(`[PositionService] Position created successfully with ID: ${position._id}`);
      return position;
    } catch (error) {
      console.error(`[PositionService] Error creating position:`, error);
      throw error;
    }
  }

  /**
   * Update a position
   * @param positionId - The position ID
   * @param userId - The user ID
   * @param updateData - Data to update
   * @returns The updated position or null
   */
  async updatePosition(
    positionId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    updateData: Partial<IPosition>
  ): Promise<IPosition | null> {
    try {
      console.log(`[PositionService] Updating position: ${positionId}`, updateData);

      const position = await Position.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(positionId),
          userId: new mongoose.Types.ObjectId(userId),
        },
        updateData,
        { new: true }
      );

      if (!position) {
        console.log(`[PositionService] Position not found for update`);
      } else {
        console.log(`[PositionService] Position updated successfully`);
      }

      return position;
    } catch (error) {
      console.error(`[PositionService] Error updating position:`, error);
      throw error;
    }
  }

  /**
   * Delete a position
   * @param positionId - The position ID
   * @param userId - The user ID
   * @returns True if deleted, false otherwise
   */
  async deletePosition(
    positionId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      console.log(`[PositionService] Deleting position: ${positionId}`);

      const result = await Position.deleteOne({
        _id: new mongoose.Types.ObjectId(positionId),
        userId: new mongoose.Types.ObjectId(userId),
      });

      const deleted = result.deletedCount > 0;
      console.log(`[PositionService] Position ${deleted ? 'deleted' : 'not found'}`);
      return deleted;
    } catch (error) {
      console.error(`[PositionService] Error deleting position:`, error);
      throw error;
    }
  }
}

export default new PositionService();
