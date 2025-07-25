const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Load .env from root directory (one level up from backend)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS configuration for lytic.co.uk
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://lytic.co.uk',
        'https://www.lytic.co.uk',
        ...(process.env.CORS_ORIGINS?.split(',') || [])
      ]
    : (process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080']),
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// Rate limiting
const rateLimit = require('express-rate-limit');

const configLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 10,
  message: { error: 'Too many config requests from this IP' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 50 : 100,
  message: { error: 'Too many API requests from this IP' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve static files (your current structure)
app.use(express.static(path.join(__dirname, '../')));
app.use('/frontend/dist', express.static(path.join(__dirname, '../frontend/dist')));
app.use('/frontend/src', express.static(path.join(__dirname, '../frontend/src')));

// Database setup
const dbPath = path.join(__dirname, 'games.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('📊 Connected to SQLite database');
  }
});

// Initialize database tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_length INTEGER,
            total_guesses INTEGER,
            won BOOLEAN,
            duration_seconds INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id TEXT,
            session_id TEXT
        )
    `);
    
    // Add columns if they don't exist (safe operation)
    db.run(`ALTER TABLE games ADD COLUMN user_id TEXT`, () => {});
    db.run(`ALTER TABLE games ADD COLUMN session_id TEXT`, () => {});
});

// ============================================
// Configuration API for lytic.co.uk
// ============================================

const getConfig = () => {
  const environment = process.env.NODE_ENV || 'development';
  
  // Check if we have the required environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('⚠️ Missing Supabase environment variables, using defaults');
  }
  
  const configs = {
    development: {
      supabase: {
        url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cbwtexsbwzflmgbwzvpp.supabase.co',
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNid3RleHNid3pmbG1nYnd6dnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNjU1MTUsImV4cCI6MjA2ODk0MTUxNX0.p4I1mFfNS6b23vYrmjFwSyqZ8_QEcwD_k1paY3iZbm0'
      },
      features: {
        analytics: false,
        debugging: true,
        guestMode: true,
        localDatabase: true,
        vercelAnalytics: false
      },
      apiUrl: process.env.API_URL || `http://localhost:${PORT}`,
      database: 'sqlite',
      domain: 'localhost'
    },
    production: {
      supabase: {
        url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
      },
      features: {
        analytics: true,
        debugging: false,
        guestMode: true,
        localDatabase: true,
        vercelAnalytics: true
      },
      apiUrl: process.env.API_URL || 'https://lytic.co.uk',
      database: 'sqlite',
      domain: 'lytic.co.uk'
    }
  };

  return configs[environment];
};

// Configuration endpoint
app.get('/api/config', configLimiter, (req, res) => {
  try {
    const config = getConfig();
    
    // Validate that we have required config
    if (!config.supabase.url || !config.supabase.anonKey) {
      console.error('❌ Missing required Supabase configuration');
      return res.status(500).json({
        error: 'Server configuration error - missing Supabase credentials'
      });
    }
    
    // Only send public configuration
    const publicConfig = {
      supabase: {
        url: config.supabase.url,
        anonKey: config.supabase.anonKey
      },
      features: config.features,
      apiUrl: config.apiUrl,
      database: config.database,
      domain: config.domain,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    // Cache headers
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    console.log(`📡 Config served: ${publicConfig.environment} @ ${publicConfig.domain}`);
    console.log(`🔑 Using Supabase URL: ${publicConfig.supabase.url}`);
    res.json(publicConfig);
    
  } catch (error) {
    console.error('Error serving config:', error);
    res.status(500).json({
      error: 'Failed to load configuration'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const envVars = {
    hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY || !!process.env.VITE_SUPABASE_ANON_KEY,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: PORT
  };

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: 'connected',
    uptime: process.uptime(),
    domain: process.env.NODE_ENV === 'production' ? 'lytic.co.uk' : 'localhost',
    config: envVars
  });
});

// Input validation middleware
const validateGameInput = (req, res, next) => {
  const { codeLength, totalGuesses, duration } = req.body;
  
  if (codeLength && (codeLength < 4 || codeLength > 7)) {
    return res.status(400).json({ error: 'Invalid code length. Must be between 4 and 7.' });
  }
  
  if (totalGuesses && (totalGuesses < 1 || totalGuesses > 20)) {
    return res.status(400).json({ error: 'Invalid total guesses. Must be between 1 and 20.' });
  }
  
  if (duration && (duration < 0 || duration > 3600)) {
    return res.status(400).json({ error: 'Invalid duration. Must be between 0 and 3600 seconds.' });
  }
  
  next();
};

// Enhanced Game API Routes
app.post('/api/game/start', apiLimiter, validateGameInput, (req, res) => {
    const { codeLength, userId } = req.body;
    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🎮 Game started - Length: ${codeLength}, User: ${userId || 'guest'}, Session: ${sessionId}`);
    
    res.json({ 
      success: true, 
      sessionId,
      timestamp: new Date().toISOString()
    });
});

app.post('/api/game/complete', apiLimiter, validateGameInput, (req, res) => {
    const { sessionId, codeLength, totalGuesses, won, duration, userId } = req.body;
    
    const sanitizedUserId = userId ? String(userId).substring(0, 100) : null;
    const sanitizedSessionId = sessionId ? String(sessionId).substring(0, 100) : null;
    
    db.run(
        'INSERT INTO games (code_length, total_guesses, won, duration_seconds, user_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
        [codeLength, totalGuesses, won ? 1 : 0, duration, sanitizedUserId, sanitizedSessionId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ error: 'Failed to save game data' });
                return;
            }
            
            console.log(`✅ Game completed - ID: ${this.lastID}, Won: ${won}, Guesses: ${totalGuesses}`);
            
            res.json({ 
              success: true, 
              gameId: this.lastID,
              timestamp: new Date().toISOString()
            });
        }
    );
});

app.get('/api/stats', apiLimiter, (req, res) => {
    const { userId } = req.query;
    
    let query = `
        SELECT 
            COUNT(*) as total_games,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as total_wins,
            ROUND(AVG(CASE WHEN won = 1 THEN total_guesses ELSE NULL END), 1) as avg_guesses,
            MIN(CASE WHEN won = 1 THEN total_guesses ELSE NULL END) as best_score,
            ROUND(AVG(duration_seconds), 1) as avg_duration
        FROM games
    `;
    
    let params = [];
    
    if (userId) {
        query += ' WHERE user_id = ?';
        params.push(userId);
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Failed to fetch statistics' });
            return;
        }
        
        const stats = rows[0];
        const winRate = stats.total_games > 0 ? 
            Math.round((stats.total_wins / stats.total_games) * 100) : 0;
        
        res.json({
            ...stats,
            win_rate: winRate,
            timestamp: new Date().toISOString(),
            user_filter: userId ? 'applied' : 'global'
        });
    });
});

app.get('/api/leaderboard', apiLimiter, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    db.all(`
        SELECT 
            code_length,
            total_guesses,
            duration_seconds,
            created_at,
            CASE WHEN user_id IS NOT NULL THEN 'User' ELSE 'Guest' END as player_type
        FROM games 
        WHERE won = 1
        ORDER BY total_guesses ASC, duration_seconds ASC
        LIMIT ?
    `, [limit], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Failed to fetch leaderboard' });
            return;
        }
        
        res.json({
            leaderboard: rows,
            count: rows.length,
            timestamp: new Date().toISOString()
        });
    });
});

// Handle API 404s
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handling
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    timestamp: new Date().toISOString()
  });
});

// Catch all handler for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('📊 Database connection closed.');
    }
    process.exit(0);
  });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, '../')}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Production domain: lytic.co.uk`);
    console.log(`📡 Config API: http://localhost:${PORT}/api/config`);
    console.log(`💊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📄 .env loaded from: ${path.join(__dirname, '../.env')}`);
});