import { IBotConfig } from '../models/BotConfig';
import mongoose from 'mongoose';
/**
 * Get bot configuration for a user
 * Creates default config if none exists
 */
export declare const getUserConfig: (userId: string | mongoose.Types.ObjectId) => Promise<IBotConfig>;
/**
 * Update bot configuration for a user
 */
export declare const updateUserConfig: (userId: string | mongoose.Types.ObjectId, updates: Partial<IBotConfig>) => Promise<IBotConfig>;
/**
 * Delete bot configuration for a user (for testing/cleanup)
 */
export declare const deleteUserConfig: (userId: string | mongoose.Types.ObjectId) => Promise<boolean>;
/**
 * Get all configurations (admin only, for monitoring)
 */
export declare const getAllConfigs: () => Promise<IBotConfig[]>;
//# sourceMappingURL=configService.d.ts.map