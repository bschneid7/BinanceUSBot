import mongoose from 'mongoose';
/**
 * Emergency stop - Flatten all positions and halt trading
 */
export declare const emergencyStop: (userId: mongoose.Types.ObjectId) => Promise<{
    success: boolean;
    message: string;
    positionsFlattened: number;
}>;
/**
 * Resume trading after halt
 */
export declare const resumeTrading: (userId: mongoose.Types.ObjectId, justification?: string) => Promise<{
    success: boolean;
    message: string;
    previousStatus: string;
    justification?: undefined;
} | {
    success: boolean;
    message: string;
    previousStatus: "HALTED_DAILY" | "HALTED_WEEKLY" | "STOPPED";
    justification: string | undefined;
}>;
/**
 * Get current bot control status
 */
export declare const getControlStatus: (userId: mongoose.Types.ObjectId) => Promise<{
    botStatus: "ACTIVE" | "HALTED_DAILY" | "HALTED_WEEKLY" | "STOPPED";
    haltMetadata: {
        reason?: string;
        timestamp?: Date;
        justification?: string;
        positionsFlattened?: number;
    } | undefined;
    openPositions: number;
}>;
declare const _default: {
    emergencyStop: (userId: mongoose.Types.ObjectId) => Promise<{
        success: boolean;
        message: string;
        positionsFlattened: number;
    }>;
    resumeTrading: (userId: mongoose.Types.ObjectId, justification?: string) => Promise<{
        success: boolean;
        message: string;
        previousStatus: string;
        justification?: undefined;
    } | {
        success: boolean;
        message: string;
        previousStatus: "HALTED_DAILY" | "HALTED_WEEKLY" | "STOPPED";
        justification: string | undefined;
    }>;
    getControlStatus: (userId: mongoose.Types.ObjectId) => Promise<{
        botStatus: "ACTIVE" | "HALTED_DAILY" | "HALTED_WEEKLY" | "STOPPED";
        haltMetadata: {
            reason?: string;
            timestamp?: Date;
            justification?: string;
            positionsFlattened?: number;
        } | undefined;
        openPositions: number;
    }>;
};
export default _default;
//# sourceMappingURL=botControlService.d.ts.map