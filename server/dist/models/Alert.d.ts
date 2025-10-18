import mongoose, { Document } from 'mongoose';
export interface IAlert extends Document {
    level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    message: string;
    type: string;
    timestamp: Date;
    userId: mongoose.Types.ObjectId;
}
declare const Alert: mongoose.Model<IAlert, {}, {}, {}, mongoose.Document<unknown, {}, IAlert, {}, {}> & IAlert & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default Alert;
//# sourceMappingURL=Alert.d.ts.map