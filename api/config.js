// api/config.js - Single source of truth for all configuration
export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['GET'] 
    });
  }

  try {
    // Environment detection
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Core Supabase configuration with your REAL keys
    const supabaseUrl = process.env.SUPABASE_URL || 'https://cbwtexsbwzflmgbwzvpp.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fkRPbjI9oLx6ylOBB9Ryqw__ig_qRqX';
    
    // Validate key format
    if (!supabaseKey.startsWith('sb_publishable_')) {
      console.error('❌ Invalid Supabase publishable key format');
      return res.status(500).json({
        error: 'Invalid API key configuration',
        details: 'Supabase publishable key must start with sb_publishable_',
        timestamp: new Date().toISOString()
      });
    }

    // Build configuration object
    const config = {
      // Supabase configuration
      supabase: {
        url: supabaseUrl,
        anonKey: supabaseKey,
        publishableKey: supabaseKey
      },

      // Payments configuration (for future)
      payments: {
        enabled: false, // TODO: Enable when ready
        stripe: {
          // Will add when implementing payments:
          // publishableKey: isProduction 
          //   ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE
          //   : process.env.STRIPE_PUBLISHABLE_KEY_TEST
        }
      },

      // Feature flags
      features: {
        analytics: isProduction,
        debugging: isDevelopment,
        guestMode: true,
        localDatabase: false,
        vercelAnalytics: isProduction,
        universalSaving: true,
        
        // Future features (ready to enable):
        payments: false,
        userProfiles: true,
        leaderboards: true,
        customThemes: false,
        multiplayerMode: false
      },

      // App configuration
      app: {
        name: 'Lytic',
        version: '1.0.0',
        apiUrl: isProduction ? 'https://lytic.co.uk' : 'http://localhost:3000',
        domain: isProduction ? 'lytic.co.uk' : 'localhost',
        environment: process.env.NODE_ENV || 'production'
      },

      // Database configuration
      database: {
        type: 'supabase',
        backupEnabled: isProduction
      },

      // Security configuration
      security: {
        rateLimiting: isProduction,
        corsEnabled: true,
        encryptionEnabled: isProduction
      },

      // Metadata
      timestamp: new Date().toISOString(),
      keyFormat: 'new',
      configVersion: '2.0.0'
    };

    // Set appropriate cache headers
    if (isProduction) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    
    // Log successful config serving (without sensitive data)
    console.log('✅ Configuration served successfully');
    console.log(`🌍 Environment: ${config.app.environment}`);
    console.log(`🔑 Key format: ${config.keyFormat}`);
    console.log(`🔑 Key preview: ${supabaseKey.substring(0, 30)}...`);
    
    res.status(200).json(config);
    
  } catch (error) {
    console.error('❌ Error serving configuration:', error);
    res.status(500).json({
      error: 'Failed to load configuration',
      message: error.message,
      timestamp: new Date().toISOString(),
      support: 'Check your environment variables and try again'
    });
  }
}