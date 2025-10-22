import BotConfig, { IBotConfig } from '../models/BotConfig';
import mongoose from 'mongoose';

/**
 * Get bot configuration for a user
 * Creates default config if none exists
 */
export const getUserConfig = async (userId: string | mongoose.Types.ObjectId): Promise<IBotConfig> => {
  try {
    console.log(`[ConfigService] Fetching config for user: ${userId}`);

    let config = await BotConfig.findOne({ userId });

    // If no config exists, create one with defaults
    if (!config) {
      console.log(`[ConfigService] No config found, creating default config for user: ${userId}`);
      config = await BotConfig.create({ userId });
      console.log(`[ConfigService] Default config created successfully for user: ${userId}`);
    }

    return config;
  } catch (error) {
    console.error(`[ConfigService] Error fetching user config:`, error);
    throw error;
  }
};

/**
 * Update bot configuration for a user
 */
export const updateUserConfig = async (
  userId: string | mongoose.Types.ObjectId,
  updates: Partial<IBotConfig>
): Promise<IBotConfig> => {
  try {
    console.log(`[ConfigService] Updating config for user: ${userId}`);
    console.log(`[ConfigService] Update payload:`, JSON.stringify(updates, null, 2));

    // Validate that we're not updating protected fields
    const protectedFields = ['_id', 'userId', 'createdAt', 'updatedAt'];
    const updateKeys = Object.keys(updates);
    const hasProtectedFields = updateKeys.some(key => protectedFields.includes(key));

    if (hasProtectedFields) {
      throw new Error('Cannot update protected fields: _id, userId, createdAt, updatedAt');
    }

    // Validate numeric ranges for critical fields
    if (updates.risk) {
      const { risk } = updates;
      if (risk.R_pct !== undefined && (risk.R_pct < 0.001 || risk.R_pct > 0.02)) {
        throw new Error('R_pct must be between 0.1% and 2%');
      }
      if (risk.max_exposure_pct !== undefined && (risk.max_exposure_pct < 0.3 || risk.max_exposure_pct > 0.8)) {
        throw new Error('max_exposure_pct must be between 30% and 80%');
      }
      if (risk.max_positions !== undefined && (risk.max_positions < 1 || risk.max_positions > 10)) {
        throw new Error('max_positions must be between 1 and 10');
      }
    }

    if (updates.reserve) {
      const { reserve } = updates;
      if (reserve.target_pct !== undefined && (reserve.target_pct < 0.1 || reserve.target_pct > 0.5)) {
        throw new Error('reserve target_pct must be between 10% and 50%');
      }
      if (reserve.floor_pct !== undefined && (reserve.floor_pct < 0.1 || reserve.floor_pct > 0.4)) {
        throw new Error('reserve floor_pct must be between 10% and 40%');
      }
      if (reserve.floor_pct !== undefined && reserve.target_pct !== undefined) {
        if (reserve.floor_pct >= reserve.target_pct) {
          throw new Error('reserve floor_pct must be less than target_pct');
        }
      }
    }

    // Enhanced validation for playbook parameters
    if (updates.playbook_a) {
      const { playbook_a } = updates;
      if (playbook_a.entry?.rsi_threshold !== undefined) {
        const rsi = playbook_a.entry.rsi_threshold;
        if (rsi < 10 || rsi > 90) {
          throw new Error('Playbook A RSI threshold must be between 10 and 90');
        }
      }
      if (playbook_a.exit?.profit_target_R !== undefined) {
        const target = playbook_a.exit.profit_target_R;
        if (target < 0.5 || target > 10) {
          throw new Error('Playbook A profit target must be between 0.5R and 10R');
        }
      }
      if (playbook_a.exit?.stop_loss_R !== undefined) {
        const stop = playbook_a.exit.stop_loss_R;
        if (stop < 0.5 || stop > 3) {
          throw new Error('Playbook A stop loss must be between 0.5R and 3R');
        }
      }
    }

    // Cross-field validation
    if (updates.risk && updates.reserve) {
      const maxExposure = updates.risk.max_exposure_pct || 0.7;
      const reserveTarget = updates.reserve.target_pct || 0.3;
      if (maxExposure + reserveTarget > 1.0) {
        throw new Error('max_exposure_pct + reserve target_pct cannot exceed 100%');
      }
    }

    // Find and update the config
    const config = await BotConfig.findOneAndUpdate(
      { userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!config) {
      console.log(`[ConfigService] Config not found, creating new one for user: ${userId}`);
      const newConfig = await BotConfig.create({ userId, ...updates });
      console.log(`[ConfigService] New config created successfully for user: ${userId}`);
      return newConfig;
    }

    console.log(`[ConfigService] Config updated successfully for user: ${userId}`);
    return config;
  } catch (error) {
    console.error(`[ConfigService] Error updating user config:`, error);
    throw error;
  }
};

/**
 * Delete bot configuration for a user (for testing/cleanup)
 */
export const deleteUserConfig = async (userId: string | mongoose.Types.ObjectId): Promise<boolean> => {
  try {
    console.log(`[ConfigService] Deleting config for user: ${userId}`);

    const result = await BotConfig.deleteOne({ userId });

    if (result.deletedCount === 0) {
      console.log(`[ConfigService] No config found to delete for user: ${userId}`);
      return false;
    }

    console.log(`[ConfigService] Config deleted successfully for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[ConfigService] Error deleting user config:`, error);
    throw error;
  }
};

/**
 * Get all configurations (admin only, for monitoring)
 */
export const getAllConfigs = async (): Promise<IBotConfig[]> => {
  try {
    console.log(`[ConfigService] Fetching all configs`);

    const configs = await BotConfig.find().populate('userId', 'email');

    console.log(`[ConfigService] Found ${configs.length} configs`);
    return configs;
  } catch (error) {
    console.error(`[ConfigService] Error fetching all configs:`, error);
    throw error;
  }
};
