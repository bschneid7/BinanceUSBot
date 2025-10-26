import { Request, Response, NextFunction } from 'express';

/**
 * Auth middleware that can be used directly or as a factory
 * For now, this just passes through all requests
 * In production, this should validate JWT tokens
 */
export const requireUser = (req?: Request | any, res?: Response, next?: NextFunction) => {
    // If called as a factory (no arguments or first arg is not a Request)
    if (!req || typeof req !== 'object' || !res || !next) {
        // Return middleware function
        return (req: Request, res: Response, next: NextFunction) => {
            // TODO: Implement proper JWT validation
            next();
        };
    }
    
    // Called directly as middleware
    // TODO: Implement proper JWT validation
    next();
};

export const optionalUser = (req?: Request | any, res?: Response, next?: NextFunction) => {
    // If called as a factory
    if (!req || typeof req !== 'object' || !res || !next) {
        return (req: Request, res: Response, next: NextFunction) => {
            // TODO: Implement optional JWT validation
            next();
        };
    }
    
    // Called directly as middleware
    // TODO: Implement optional JWT validation
    next();
};

