import mongoose, { Schema } from 'mongoose';
const TaxReportSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    month: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}$/ // YYYY-MM format
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    equity: {
        type: Number,
        required: true
    },
    realizedPnl: {
        type: Number,
        required: true
    },
    feesPaid: {
        type: Number,
        required: true
    },
    balances: {
        type: Map,
        of: Number,
        required: true
    },
    contentHash: {
        type: String,
        required: true
    },
    frozen: {
        type: Boolean,
        default: true
    },
    pdfUrl: {
        type: String
    },
    reconciliationStatus: {
        type: String,
        enum: ['pending', 'balanced', 'discrepancy'],
        default: 'balanced'
    },
    notes: {
        type: String
    }
}, {
    timestamps: false
});
// Compound index for user and month (unique combination)
TaxReportSchema.index({ userId: 1, month: 1 }, { unique: true });
// Index for sorting by month
TaxReportSchema.index({ month: -1 });
const TaxReport = mongoose.model('TaxReport', TaxReportSchema);
export default TaxReport;
//# sourceMappingURL=TaxReport.js.map