import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    level: {
        type: String,
        enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
        required: true,
        index: true,
    },
    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true,
        index: true,
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
schema.index({ userId: 1, level: 1 });
const Alert = mongoose.model('Alert', schema);
export default Alert;
//# sourceMappingURL=Alert.js.map