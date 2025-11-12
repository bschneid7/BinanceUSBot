/**
 * Environment Variable Validation
 * 
 * Validates all required environment variables at boot time.
 * Fails fast with clear error messages if configuration is missing or invalid.
 * 
 * Usage:
 *   import { env } from './config/env';
 *   
 *   console.log(env.BINANCE_US_API_KEY); // Validated and type-safe
 */

import { cleanEnv, str, port, url, bool } from 'envalid';

export const env = cleanEnv(process.env, {
  // ===== Server Configuration =====
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    desc: 'Node environment',
  }),
  
  PORT: port({
    default: 3000,
    desc: 'Server port',
  }),
  
  // ===== Database Configuration =====
  MONGO_URI: url({
    desc: 'MongoDB connection URI',
    example: 'mongodb://admin:password@mongo:27017/binance_bot?authSource=admin',
  }),
  
  // ===== Binance API Configuration =====
  BINANCE_US_API_KEY: str({
    desc: 'Binance.US API key',
  }),
  
  BINANCE_US_API_SECRET: str({
    desc: 'Binance.US API secret',
  }),
  
  // ===== Authentication Configuration =====
  JWT_SECRET: str({
    minLength: 32,
    desc: 'JWT secret for access tokens (min 32 characters)',
    example: 'your-super-secret-jwt-key-here-min-32-chars',
  }),
  
  JWT_REFRESH_SECRET: str({
    minLength: 32,
    desc: 'JWT secret for refresh tokens (min 32 characters)',
    example: 'your-super-secret-refresh-key-here-min-32-chars',
  }),
  
  // ===== Trading Configuration =====
  SIGNAL_TIER: str({
    choices: ['TIER_1_CONSERVATIVE', 'TIER_2_MODERATE', 'TIER_3_AGGRESSIVE'],
    default: 'TIER_3_AGGRESSIVE',
    desc: 'Active trading tier',
  }),
  
  // ===== Optional Features =====
  EMAIL_ENABLED: bool({
    default: false,
    desc: 'Enable email notifications',
  }),
  
  EMAIL_PROVIDER: str({
    choices: ['sendgrid', 'smtp'],
    default: 'sendgrid',
    desc: 'Email service provider',
  }),
  
  EMAIL_FROM: str({
    default: '',
    desc: 'Email sender address',
  }),
  
  EMAIL_TO: str({
    default: '',
    desc: 'Email recipient address',
  }),
  
  SENDGRID_API_KEY: str({
    default: '',
    desc: 'SendGrid API key (required if EMAIL_ENABLED=true)',
  }),
  
  ML_ENHANCED_SIGNALS: bool({
    default: false,
    desc: 'Enable ML-enhanced signal generation',
  }),
  
  // ===== Docker Environment Flag =====
  DOCKER_ENV: str({
    default: 'false',
    desc: 'Running in Docker container',
  }),
});

/**
 * Validate email configuration if email is enabled
 */
if (env.EMAIL_ENABLED) {
  if (!env.EMAIL_FROM || !env.EMAIL_TO) {
    throw new Error(
      'EMAIL_FROM and EMAIL_TO are required when EMAIL_ENABLED=true'
    );
  }
  
  if (env.EMAIL_PROVIDER === 'sendgrid' && !env.SENDGRID_API_KEY) {
    throw new Error(
      'SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid'
    );
  }
}

/**
 * Log validated configuration (without secrets)
 */
console.log('[EnvValidation] ✅ Environment variables validated successfully');
console.log('[EnvValidation] Node environment:', env.NODE_ENV);
console.log('[EnvValidation] Server port:', env.PORT);
console.log('[EnvValidation] Signal tier:', env.SIGNAL_TIER);
console.log('[EnvValidation] Email enabled:', env.EMAIL_ENABLED);
console.log('[EnvValidation] ML enhanced signals:', env.ML_ENHANCED_SIGNALS);
console.log('[EnvValidation] Docker environment:', env.DOCKER_ENV);
