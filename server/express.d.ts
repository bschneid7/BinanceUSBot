// Type extensions for Express
import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: Types.ObjectId;
        email: string;
        role?: string;
      };
    }
  }
}

export {};

