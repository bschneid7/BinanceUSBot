import { ITaxReport } from '../models/TaxReport';
import mongoose from 'mongoose';
export interface TaxReportFilters {
    year?: number;
    status?: 'pending' | 'balanced' | 'discrepancy';
}
/**
 * Get all tax reports for a user
 * @param userId - User ID
 * @param filters - Optional filters (year, status)
 * @returns Array of tax reports
 */
export declare const getTaxReports: (userId: string | mongoose.Types.ObjectId, filters?: TaxReportFilters) => Promise<ITaxReport[]>;
/**
 * Get a specific tax report by month
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @returns Tax report or null
 */
export declare const getTaxReportByMonth: (userId: string | mongoose.Types.ObjectId, month: string) => Promise<ITaxReport | null>;
/**
 * Create a new tax report (monthly reconciliation)
 * @param userId - User ID
 * @param reportData - Tax report data
 * @returns Created tax report
 */
export declare const createTaxReport: (userId: string | mongoose.Types.ObjectId, reportData: {
    month: string;
    equity: number;
    realizedPnl: number;
    feesPaid: number;
    balances: {
        [symbol: string]: number;
    };
    contentHash: string;
    frozen?: boolean;
    pdfUrl?: string;
    reconciliationStatus?: "pending" | "balanced" | "discrepancy";
    notes?: string;
}) => Promise<ITaxReport>;
/**
 * Update a tax report (only if not frozen)
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @param updates - Fields to update
 * @returns Updated tax report or null
 */
export declare const updateTaxReport: (userId: string | mongoose.Types.ObjectId, month: string, updates: Partial<{
    equity: number;
    realizedPnl: number;
    feesPaid: number;
    balances: {
        [symbol: string]: number;
    };
    pdfUrl: string;
    reconciliationStatus: "pending" | "balanced" | "discrepancy";
    notes: string;
}>) => Promise<ITaxReport | null>;
/**
 * Delete a tax report (only if not frozen)
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @returns True if deleted, false otherwise
 */
export declare const deleteTaxReport: (userId: string | mongoose.Types.ObjectId, month: string) => Promise<boolean>;
/**
 * Get tax report statistics for a user
 * @param userId - User ID
 * @returns Statistics object
 */
export declare const getTaxReportStats: (userId: string | mongoose.Types.ObjectId) => Promise<{
    totalReports: number;
    totalRealizedPnl: number;
    totalFees: number;
    latestMonth: string | null;
    balancedReports: number;
    pendingReports: number;
    discrepancyReports: number;
}>;
//# sourceMappingURL=taxReportService.d.ts.map