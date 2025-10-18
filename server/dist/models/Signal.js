import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    playbook: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true,
        index: true,
    },
    action: {
        type: String,
        enum: ['EXECUTED', 'SKIPPED'],
        required: true,
        index: true,
    },
    reason: {
        type: String,
    },
    entry_price: {
        type: Number,
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    versionKey: false,
    timestamps: false,
});
// Compound index for efficient time-based queries
schema.index({ userId: 1, timestamp: -1 });
const Signal = mongoose.model('Signal', schema);
export default Signal;
//# sourceMappingURL=Signal.js.map