// filepath: src/config.ts
/**
 * Configuration module for the application.
 * Centralizes all configuration parameters in one place.
 */

export const config = {
    // Server configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
    },

    // Database configuration
    db: {
        mongoUri: process.env.MONGODB_URI || '',
    },

    // VAPI configuration
    vapi: {
        apiKey: process.env.VAPI_API_KEY || '',
    },

    // Default call time settings
    callTimes: {
        defaultStartTime: process.env.DEFAULT_CALL_START_TIME || '03:30',
        defaultEndTime: process.env.DEFAULT_CALL_END_TIME || '05:30',
    }
};

/**
 * Validates that all required environment variables are present
 * @returns Array of missing environment variables
 */
export const validateEnv = (): string[] => {
    const requiredEnvVars = [
        'MONGODB_URI',
        'VAPI_API_KEY',
    ];

    return requiredEnvVars.filter(key => !process.env[key]);
};
