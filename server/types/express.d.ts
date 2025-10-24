import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: Types.ObjectId | string;
        email?: string;
        role?: string;
        [key: string]: any;
      };
    }
  }
}

export {};

