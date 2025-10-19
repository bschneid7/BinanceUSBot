import express from 'express';
import { Request, Response } from 'express';
import UserService from '../services/userService';
import { requireUser } from './middlewares/auth';
import User from '../models/User';
import { generateAccessToken, generateRefreshToken } from '../utils/auth';
import jwt from 'jsonwebtoken';
import { ALL_ROLES } from 'shared';

const router = express.Router();

interface AuthRequest extends Request {
  user?: Record<string, unknown>;
}

// Description: Login user
// Endpoint: POST /api/auth/login
// Request: { email: string, password: string }
// Response: { _id, email, accessToken, refreshToken, ... }
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log(`[POST /api/auth/login] Login attempt for email: ${email}`);

    if (!email || !password) {
      console.log('[POST /api/auth/login] Missing email or password');
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await UserService.authenticateWithPassword(email, password);

    if (user) {
      console.log(`[POST /api/auth/login] User authenticated successfully: ${user._id}`);
      const accessToken = generateAccessToken(user._id.toString());
      const refreshToken = generateRefreshToken(user._id.toString());

      user.refreshToken = refreshToken;
      await user.save();

      console.log(`[POST /api/auth/login] Tokens generated and saved`);
      return res.json({...user.toObject(), accessToken, refreshToken});
    } else {
      console.log(`[POST /api/auth/login] Authentication failed for email: ${email}`);
      return res.status(400).json({ message: 'Email or password is incorrect' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[POST /api/auth/login] Error during login:`, error);
    return res.status(500).json({ message: `Login error: ${errorMessage}` });
  }
});

// Description: Register new user
// Endpoint: POST /api/auth/register
// Request: { email: string, password: string }
// Response: { _id, email, ... }
router.post("/register", async (req: Request, res: Response) => {
  return res.status(403).json({ message: "Registration is disabled" });
});

// Description: Logout user
// Endpoint: POST /api/auth/logout
// Request: { email: string }
// Response: { message: string }
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    console.log(`[POST /api/auth/logout] Logout attempt for email: ${email}`);

    const user = await User.findOne({ email });
    if (user) {
      user.refreshToken = null;
      await user.save();
      console.log(`[POST /api/auth/logout] User logged out successfully: ${user._id}`);
    }

    res.status(200).json({ message: 'User logged out successfully.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[POST /api/auth/logout] Logout error:`, error);
    return res.status(500).json({ message: `Logout error: ${errorMessage}` });
  }
});

// Description: Refresh access token
// Endpoint: POST /api/auth/refresh
// Request: { refreshToken: string }
// Response: { success: boolean, data: { _id, email, accessToken, refreshToken, ... } }
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  console.log(`[POST /api/auth/refresh] Token refresh attempt`);

  if (!refreshToken) {
    console.log('[POST /api/auth/refresh] No refresh token provided');
    return res.status(401).json({
      success: false,
      message: 'Refresh token is required'
    });
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as jwt.JwtPayload;

    // Find the user
    const user = await UserService.get(decoded.sub);

    if (!user) {
      console.log(`[POST /api/auth/refresh] User not found for token`);
      return res.status(403).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.refreshToken !== refreshToken) {
      console.log(`[POST /api/auth/refresh] Invalid refresh token for user: ${user._id}`);
      return res.status(403).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update user's refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    console.log(`[POST /api/auth/refresh] Tokens refreshed successfully for user: ${user._id}`);

    // Return new tokens
    return res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[POST /api/auth/refresh] Token refresh error:`, error);

    if (errorName === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Refresh token has expired'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
});

// Description: Get current user profile
// Endpoint: GET /api/auth/me
// Request: {}
// Response: { _id, email, role, ... }
router.get('/me', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[GET /api/auth/me] Profile request for user: ${req.user?._id}`);
    return res.status(200).json(req.user);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GET /api/auth/me] Error:`, error);
    return res.status(500).json({ message: `Error fetching user profile: ${errorMessage}` });
  }
});


// Description: Change user password
// Endpoint: POST /api/auth/change-password
// Request: { currentPassword: string, newPassword: string }
// Response: { success: boolean, message: string }
router.post('/change-password', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[POST /api/auth/change-password] Password change request from user: ${req.user?._id}`);

    if (!req.user?._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Both currentPassword and newPassword are required' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'New password must be at least 8 characters long' 
      });
    }

    // Get user from database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const { validatePassword } = await import('../utils/password');
    const isValidPassword = await validatePassword(currentPassword, user.password);
    
    if (!isValidPassword) {
      console.log(`[POST /api/auth/change-password] Invalid current password for user: ${req.user._id}`);
      return res.status(401).json({ 
        error: 'Invalid password',
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const { generatePasswordHash } = await import('../utils/password');
    const hashedPassword = await generatePasswordHash(newPassword);
    
    // Update password
    user.password = hashedPassword;
    await user.save();

    console.log(`[POST /api/auth/change-password] Password changed successfully for user: ${req.user._id}`);
    
    return res.status(200).json({ 
      success: true,
      message: 'Password changed successfully' 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[POST /api/auth/change-password] Error:`, error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: `Failed to change password: ${errorMessage}`
    });
  }
});


export default router;
