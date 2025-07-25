// api/config.js - Vercel Serverless Function
export default function handler(req, res) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      // Validate environment variables
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase environment variables');
        return res.status(500).json({
          error: 'Server configuration error - missing Supabase credentials'
        });
      }

      const config = {
        supabase: {
          url: supabaseUrl,
          anonKey: supabaseKey
        },
        features: {
          analytics: true,
          debugging: false,
          guestMode: true,
          localDatabase: false,
          vercelAnalytics: true,
          universalSaving: true
        },
        apiUrl: 'https://lytic.co.uk',
        database: 'supabase',
        domain: 'lytic.co.uk',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      // Set cache headers for production
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      
      console.log('✅ Config served successfully for lytic.co.uk');
      res.status(200).json(config);
      
    } catch (error) {
      console.error('Error serving config:', error);
      res.status(500).json({
        error: 'Failed to load configuration',
        message: error.message
      });
    }
  } else {
    res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['GET'] 
    });
  }
}