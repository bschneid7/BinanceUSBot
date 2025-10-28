import UserService from '../../services/userService';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { ALL_ROLES } from 'shared';

interface AuthRequest extends Request {
  user?: Record<string, unknown>;
}

// Development mode toggle - temporarily forced to true until frontend auth is implemented
// TODO: Set to false once frontend has proper JWT authentication
const DEVELOPMENT_MODE = true; // process.env.NODE_ENV !== 'production';

const requireUser = (allowedRoles: string[] = ALL_ROLES) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      if (DEVELOPMENT_MODE) {
        console.log('[Auth] No token provided - allowing request (development mode)');
        // Create a mock user for development with valid MongoDB ObjectId format
        req.user = {
          _id: '68fac3bbd5f133b16fce5f47', // Real user ID from database
          email: 'bschneid7@gmail.com',
          role: 'admin'
        };
        return next();
      }
      
      console.log('[Auth] No token provided - rejecting request');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No authorization token provided' 
      });
    }

    try {
      // Verify JWT token
      if (!process.env.JWT_SECRET) {
        console.error('[Auth] JWT_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
      
      // Verify token has required fields
      if (!decoded.userId) {
        console.log('[Auth] Token missing userId');
        return res.status(401).json({ error: 'Invalid token format' });
      }

      // Get user from database
      const user = await UserService.get(decoded.userId);
      
      if (!user) {
        console.log('[Auth] User not found for token userId:', decoded.userId);
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if user has required role
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(user.role)) {
          console.log('[Auth] User lacks required role:', user.role, 'Required:', allowedRoles);
          return res.status(403).json({ 
            error: 'Insufficient permissions',
            message: `Required role: ${allowedRoles.join(' or ')}`
          });
        }
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      if (DEVELOPMENT_MODE) {
        console.log('[Auth] Token validation failed - allowing request (development mode)');
        // Allow even if token is invalid in development
        req.user = {
          _id: '68fac3bbd5f133b16fce5f47',
          email: 'bschneid7@gmail.com',
          role: 'admin'
        };
        return next();
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        console.log('[Auth] Token expired');
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'Please log in again' 
        });
      } else if (error instanceof jwt.JsonWebTokenError) {
        console.log('[Auth] Invalid token:', error.message);
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Authentication failed' 
        });
      } else {
        console.error('[Auth] Unexpected error during authentication:', error);
        return res.status(500).json({ error: 'Authentication error' });
      }
    }
  };
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but allows request to proceed without auth
 */
const optionalUser = () => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      if (DEVELOPMENT_MODE) {
        // Attach mock user in development mode
        req.user = {
          _id: '68fac3bbd5f133b16fce5f47',
          email: 'bschneid7@gmail.com',
          role: 'admin'
        };
      }
      return next();
    }

    try {
      if (!process.env.JWT_SECRET) {
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
      
      if (decoded.userId) {
        const user = await UserService.get(decoded.userId);
        if (user) {
          req.user = user;
        }
      }
    } catch (error) {
      // Token invalid, just proceed without user (or with mock user in dev)
      if (DEVELOPMENT_MODE) {
        req.user = {
          _id: '68fac3bbd5f133b16fce5f47',
          email: 'bschneid7@gmail.com',
          role: 'admin'
        };
      }
      console.log('[Auth] Optional auth failed, proceeding');
    }
    
    next();
  };
};

export {
  requireUser,
  optionalUser,
};

