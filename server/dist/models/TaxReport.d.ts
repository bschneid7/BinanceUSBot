import mongoose, { Document } from 'mongoose';
export interface ITaxReport extends Document {
    userId: mongoose.Types.ObjectId;
    month: string;
    createdAt: Date;
    equity: number;
    realizedPnl: number;
    feesPaid: number;
    balances: {
        [symbol: string]: number;
    };
    contentHash: string;
    frozen: boolean;
    pdfUrl?: string;
    reconciliationStatus: 'pending' | 'balanced' | 'discrepancy';
    notes?: string;
}
declare const TaxReport: mongoose.Model<ITaxReport, {}, {}, {}, mongoose.Document<unknown, {}, ITaxReport, {}, {}> & ITaxReport & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default TaxReport;
//# sourceMappingURL=TaxReport.d.ts.map