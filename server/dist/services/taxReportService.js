import TaxReport from '../models/TaxReport';
/**
 * Get all tax reports for a user
 * @param userId - User ID
 * @param filters - Optional filters (year, status)
 * @returns Array of tax reports
 */
export const getTaxReports = async (userId, filters) => {
    try {
        console.log(`[TaxReportService] Fetching tax reports for user: ${userId}`);
        const query = { userId };
        // Apply filters
        if (filters?.year) {
            query.month = { $regex: `^${filters.year}-` };
            console.log(`[TaxReportService] Filtering by year: ${filters.year}`);
        }
        if (filters?.status) {
            query.reconciliationStatus = filters.status;
            console.log(`[TaxReportService] Filtering by status: ${filters.status}`);
        }
        const reports = await TaxReport.find(query).sort({ month: -1 });
        console.log(`[TaxReportService] Found ${reports.length} tax reports`);
        return reports;
    }
    catch (error) {
        console.error(`[TaxReportService] Error fetching tax reports:`, error);
        throw new Error('Failed to fetch tax reports');
    }
};
/**
 * Get a specific tax report by month
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @returns Tax report or null
 */
export const getTaxReportByMonth = async (userId, month) => {
    try {
        console.log(`[TaxReportService] Fetching tax report for user: ${userId}, month: ${month}`);
        // Validate month format
        if (!/^\d{4}-\d{2}$/.test(month)) {
            throw new Error('Invalid month format. Expected YYYY-MM');
        }
        const report = await TaxReport.findOne({ userId, month });
        if (!report) {
            console.log(`[TaxReportService] No tax report found for month: ${month}`);
        }
        else {
            console.log(`[TaxReportService] Found tax report for month: ${month}`);
        }
        return report;
    }
    catch (error) {
        console.error(`[TaxReportService] Error fetching tax report by month:`, error);
        throw error;
    }
};
/**
 * Create a new tax report (monthly reconciliation)
 * @param userId - User ID
 * @param reportData - Tax report data
 * @returns Created tax report
 */
export const createTaxReport = async (userId, reportData) => {
    try {
        console.log(`[TaxReportService] Creating tax report for user: ${userId}, month: ${reportData.month}`);
        // Validate month format
        if (!/^\d{4}-\d{2}$/.test(reportData.month)) {
            throw new Error('Invalid month format. Expected YYYY-MM');
        }
        // Check if report already exists
        const existingReport = await TaxReport.findOne({
            userId,
            month: reportData.month
        });
        if (existingReport) {
            console.error(`[TaxReportService] Tax report already exists for month: ${reportData.month}`);
            throw new Error(`Tax report for ${reportData.month} already exists`);
        }
        const report = new TaxReport({
            userId,
            ...reportData
        });
        await report.save();
        console.log(`[TaxReportService] Tax report created successfully for month: ${reportData.month}`);
        return report;
    }
    catch (error) {
        console.error(`[TaxReportService] Error creating tax report:`, error);
        throw error;
    }
};
/**
 * Update a tax report (only if not frozen)
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @param updates - Fields to update
 * @returns Updated tax report or null
 */
export const updateTaxReport = async (userId, month, updates) => {
    try {
        console.log(`[TaxReportService] Updating tax report for user: ${userId}, month: ${month}`);
        const report = await TaxReport.findOne({ userId, month });
        if (!report) {
            console.error(`[TaxReportService] Tax report not found for month: ${month}`);
            throw new Error(`Tax report for ${month} not found`);
        }
        if (report.frozen) {
            console.error(`[TaxReportService] Cannot update frozen tax report for month: ${month}`);
            throw new Error(`Tax report for ${month} is frozen and cannot be updated`);
        }
        Object.assign(report, updates);
        await report.save();
        console.log(`[TaxReportService] Tax report updated successfully for month: ${month}`);
        return report;
    }
    catch (error) {
        console.error(`[TaxReportService] Error updating tax report:`, error);
        throw error;
    }
};
/**
 * Delete a tax report (only if not frozen)
 * @param userId - User ID
 * @param month - Month in YYYY-MM format
 * @returns True if deleted, false otherwise
 */
export const deleteTaxReport = async (userId, month) => {
    try {
        console.log(`[TaxReportService] Deleting tax report for user: ${userId}, month: ${month}`);
        const report = await TaxReport.findOne({ userId, month });
        if (!report) {
            console.error(`[TaxReportService] Tax report not found for month: ${month}`);
            throw new Error(`Tax report for ${month} not found`);
        }
        if (report.frozen) {
            console.error(`[TaxReportService] Cannot delete frozen tax report for month: ${month}`);
            throw new Error(`Tax report for ${month} is frozen and cannot be deleted`);
        }
        await report.deleteOne();
        console.log(`[TaxReportService] Tax report deleted successfully for month: ${month}`);
        return true;
    }
    catch (error) {
        console.error(`[TaxReportService] Error deleting tax report:`, error);
        throw error;
    }
};
/**
 * Get tax report statistics for a user
 * @param userId - User ID
 * @returns Statistics object
 */
export const getTaxReportStats = async (userId) => {
    try {
        console.log(`[TaxReportService] Fetching tax report statistics for user: ${userId}`);
        const reports = await TaxReport.find({ userId });
        const stats = {
            totalReports: reports.length,
            totalRealizedPnl: reports.reduce((sum, r) => sum + r.realizedPnl, 0),
            totalFees: reports.reduce((sum, r) => sum + r.feesPaid, 0),
            latestMonth: reports.length > 0 ? reports.sort((a, b) => b.month.localeCompare(a.month))[0].month : null,
            balancedReports: reports.filter(r => r.reconciliationStatus === 'balanced').length,
            pendingReports: reports.filter(r => r.reconciliationStatus === 'pending').length,
            discrepancyReports: reports.filter(r => r.reconciliationStatus === 'discrepancy').length
        };
        console.log(`[TaxReportService] Statistics: ${JSON.stringify(stats)}`);
        return stats;
    }
    catch (error) {
        console.error(`[TaxReportService] Error fetching tax report statistics:`, error);
        throw new Error('Failed to fetch tax report statistics');
    }
};
//# sourceMappingURL=taxReportService.js.map