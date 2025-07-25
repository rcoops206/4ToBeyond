const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env from root directory (one level up from backend)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
let supabase = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
  } else {
    console.warn('⚠️ Supabase credentials missing - universal saving will be limited');
  }
} catch (error) {
  console.error('❌ Failed to initialize Supabase:', error.message);
}

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

// ===== NEW: Universal Game Saving Rate Limiter =====
const saveGameLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 save requests per minute
  message: 'Too many save requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve static files (your current structure)
app.use(express.static(path.join(__dirname, '../')));
app.use('/frontend/dist', express.static(path.join(__dirname, '../frontend/dist')));
app.use('/frontend/src', express.static(path.join(__dirname, '../frontend/src')));

// Database setup (SQLite - keeping your existing setup)
const dbPath = path.join(__dirname, 'games.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('📊 Connected to SQLite database');
  }
});

// Initialize database tables (keeping your existing setup)
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

// ===== NEW: Universal Game Saving Validation & Sanitization =====

// Validation middleware for universal saving
function validateGameData(req, res, next) {
    const {
        session_id,
        difficulty,
        attempts,
        time_taken,
        completed,
        score
    } = req.body;

    const errors = [];

    if (!session_id || typeof session_id !== 'string') {
        errors.push('session_id is required and must be a string');
    }

    if (!difficulty || difficulty < 4 || difficulty > 7) {
        errors.push('difficulty must be between 4 and 7');
    }

    if (typeof attempts !== 'number' || attempts < 0) {
        errors.push('attempts must be a non-negative number');
    }

    if (typeof time_taken !== 'number' || time_taken < 0) {
        errors.push('time_taken must be a non-negative number');
    }

    if (typeof completed !== 'boolean') {
        errors.push('completed must be a boolean');
    }

    if (typeof score !== 'number' || score < 0) {
        errors.push('score must be a non-negative number');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors
        });
    }

    next();
}

// Sanitize input data
function sanitizeGameData(data) {
    return {
        session_id: String(data.session_id).substring(0, 100),
        difficulty: Math.max(4, Math.min(7, parseInt(data.difficulty))),
        attempts: Math.max(0, parseInt(data.attempts)),
        time_taken: Math.max(0, parseInt(data.time_taken)),
        completed: Boolean(data.completed),
        score: Math.max(0, parseInt(data.score || 0)),
        secret_code: data.secret_code ? String(data.secret_code).replace(/[^0-9]/g, '').substring(0, 7) : null,
        final_guess: data.final_guess ? String(data.final_guess).replace(/[^0-9]/g, '').substring(0, 7) : null,
        user_id: data.user_id || null,
        is_guest: Boolean(data.is_guest),
        game_started_at: data.game_started_at ? new Date(data.game_started_at).toISOString() : new Date().toISOString(),
        game_ended_at: data.game_ended_at ? new Date(data.game_ended_at).toISOString() : null,
        browser_language: data.browser_language ? String(data.browser_language).substring(0, 10) : null,
        timezone: data.timezone ? String(data.timezone).substring(0, 50) : null,
        abandoned: Boolean(data.abandoned),
        abandon_reason: data.abandon_reason ? String(data.abandon_reason).substring(0, 50) : null,
        device_info: sanitizeDeviceInfo(data.device_info),
        guess_history: sanitizeGuessHistory(data.guess_history),
        total_game_time: data.total_game_time ? Math.max(0, parseInt(data.total_game_time)) : null,
        average_time_per_guess: data.average_time_per_guess ? Math.max(0, parseFloat(data.average_time_per_guess)) : null,
        win_rate_this_session: data.win_rate_this_session ? Math.max(0, Math.min(100, parseFloat(data.win_rate_this_session))) : null
    };
}

function sanitizeDeviceInfo(deviceInfo) {
    if (!deviceInfo || typeof deviceInfo !== 'object') return null;
    
    return {
        userAgent: deviceInfo.userAgent ? String(deviceInfo.userAgent).substring(0, 500) : null,
        language: deviceInfo.language ? String(deviceInfo.language).substring(0, 10) : null,
        timezone: deviceInfo.timezone ? String(deviceInfo.timezone).substring(0, 50) : null,
        screenWidth: deviceInfo.screenWidth ? Math.max(0, parseInt(deviceInfo.screenWidth)) : null,
        screenHeight: deviceInfo.screenHeight ? Math.max(0, parseInt(deviceInfo.screenHeight)) : null,
        timestamp: deviceInfo.timestamp ? new Date(deviceInfo.timestamp).toISOString() : new Date().toISOString()
    };
}

function sanitizeGuessHistory(guessHistory) {
    if (!Array.isArray(guessHistory)) return [];
    
    return guessHistory.slice(-20).map(guess => ({
        turnNumber: guess.turnNumber ? Math.max(0, parseInt(guess.turnNumber)) : 0,
        guess: guess.guess ? String(guess.guess).replace(/[^0-9]/g, '').substring(0, 7) : '',
        correctCount: guess.correctCount ? Math.max(0, parseInt(guess.correctCount)) : 0,
        timestamp: guess.timestamp ? parseInt(guess.timestamp) : Date.now(),
        timeSinceStart: guess.timeSinceStart ? Math.max(0, parseInt(guess.timeSinceStart)) : 0
    }));
}

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
        vercelAnalytics: false,
        universalSaving: true
      },
      apiUrl: process.env.API_URL || `http://localhost:${PORT}`,
      database: 'supabase',
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
        vercelAnalytics: true,
        universalSaving: true
      },
      apiUrl: process.env.API_URL || 'https://lytic.co.uk',
      database: 'supabase',
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

// ===== NEW: Universal Game Saving API Endpoints =====

// API endpoint for saving completed games
app.post('/api/save-game', saveGameLimiter, validateGameData, async (req, res) => {
    try {
        console.log('📥 Receiving game data from:', req.ip);
        
        const sanitizedData = sanitizeGameData(req.body);
        sanitizedData.status = sanitizedData.completed ? 'completed' : 'abandoned';
        sanitizedData.created_at = new Date().toISOString();
        
        if (supabase) {
            // Save to Supabase (primary database)
            const { data, error } = await supabase
                .from('game_results')
                .insert([sanitizedData])
                .select();
            
            if (error) {
                console.error('❌ Supabase error saving game:', error);
                
                if (error.code === '23505') {
                    return res.status(409).json({
                        error: 'Duplicate game session',
                        message: 'This game session has already been saved'
                    });
                }
                
                return res.status(500).json({
                    error: 'Failed to save game',
                    message: 'Database error occurred'
                });
            }
            
            console.log('✅ Game saved to Supabase successfully:', data[0]?.id);
            
            res.status(200).json({
                success: true,
                message: 'Game saved successfully',
                id: data[0]?.id,
                database: 'supabase'
            });
        } else {
            // Fallback to SQLite if Supabase is not available
            console.log('⚠️ Supabase not available, falling back to SQLite');
            
            db.run(
                'INSERT INTO games (code_length, total_guesses, won, duration_seconds, user_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
                [sanitizedData.difficulty, sanitizedData.attempts, sanitizedData.completed ? 1 : 0, sanitizedData.time_taken, sanitizedData.user_id, sanitizedData.session_id],
                function(err) {
                    if (err) {
                        console.error('❌ SQLite error saving game:', err);
                        res.status(500).json({ error: 'Failed to save game data' });
                        return;
                    }
                    
                    console.log(`✅ Game saved to SQLite successfully - ID: ${this.lastID}`);
                    
                    res.json({ 
                        success: true, 
                        message: 'Game saved successfully',
                        id: this.lastID,
                        database: 'sqlite'
                    });
                }
            );
        }
        
    } catch (error) {
        console.error('❌ Server error saving game:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to save game'
        });
    }
});

// API endpoint for saving abandoned games
app.post('/api/save-abandoned-game', saveGameLimiter, validateGameData, async (req, res) => {
    try {
        console.log('📥 Receiving abandoned game data from:', req.ip);
        
        const sanitizedData = sanitizeGameData(req.body);
        sanitizedData.abandoned = true;
        sanitizedData.completed = false;
        sanitizedData.status = 'abandoned';
        sanitizedData.created_at = new Date().toISOString();
        
        if (supabase) {
            const { data, error } = await supabase
                .from('game_results')
                .insert([sanitizedData])
                .select();
            
            if (error) {
                console.error('❌ Supabase error saving abandoned game:', error);
                return res.status(500).json({
                    error: 'Failed to save abandoned game',
                    message: 'Database error occurred'
                });
            }
            
            console.log('✅ Abandoned game saved to Supabase successfully:', data[0]?.id);
            
            res.status(200).json({
                success: true,
                message: 'Abandoned game saved successfully',
                id: data[0]?.id,
                database: 'supabase'
            });
        } else {
            // Fallback to SQLite
            db.run(
                'INSERT INTO games (code_length, total_guesses, won, duration_seconds, user_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
                [sanitizedData.difficulty, sanitizedData.attempts, 0, sanitizedData.time_taken, sanitizedData.user_id, sanitizedData.session_id],
                function(err) {
                    if (err) {
                        console.error('❌ SQLite error saving abandoned game:', err);
                        res.status(500).json({ error: 'Failed to save abandoned game data' });
                        return;
                    }
                    
                    console.log(`✅ Abandoned game saved to SQLite successfully - ID: ${this.lastID}`);
                    
                    res.json({ 
                        success: true, 
                        message: 'Abandoned game saved successfully',
                        id: this.lastID,
                        database: 'sqlite'
                    });
                }
            );
        }
        
    } catch (error) {
        console.error('❌ Server error saving abandoned game:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to save abandoned game'
        });
    }
});

// API endpoint for bulk saving (for syncing local backups)
app.post('/api/sync-backup-games', saveGameLimiter, async (req, res) => {
    try {
        const { games } = req.body;
        
        if (!Array.isArray(games) || games.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Games array is required and must not be empty'
            });
        }
        
        if (games.length > 50) {
            return res.status(400).json({
                error: 'Too many games',
                message: 'Maximum 50 games can be synced at once'
            });
        }
        
        console.log(`📦 Syncing ${games.length} backup games from:`, req.ip);
        
        const sanitizedGames = games.map(game => {
            const sanitized = sanitizeGameData(game);
            sanitized.created_at = new Date().toISOString();
            return sanitized;
        });
        
        if (supabase) {
            const { data, error } = await supabase
                .from('game_results')
                .upsert(sanitizedGames, { 
                    onConflict: 'session_id',
                    ignoreDuplicates: true 
                })
                .select();
            
            if (error) {
                console.error('❌ Supabase error syncing backup games:', error);
                return res.status(500).json({
                    error: 'Failed to sync backup games',
                    message: 'Database error occurred'
                });
            }
            
            console.log(`✅ Successfully synced ${data?.length || 0} games to Supabase`);
            
            res.status(200).json({
                success: true,
                message: `Successfully synced ${data?.length || 0} games`,
                synced_count: data?.length || 0,
                requested_count: games.length,
                database: 'supabase'
            });
        } else {
            // Fallback bulk insert to SQLite
            let syncedCount = 0;
            
            for (const game of sanitizedGames) {
                try {
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT OR IGNORE INTO games (code_length, total_guesses, won, duration_seconds, user_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
                            [game.difficulty, game.attempts, game.completed ? 1 : 0, game.time_taken, game.user_id, game.session_id],
                            function(err) {
                                if (err) reject(err);
                                else {
                                    if (this.changes > 0) syncedCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                } catch (err) {
                    console.error('Error syncing game to SQLite:', err);
                }
            }
            
            console.log(`✅ Successfully synced ${syncedCount} games to SQLite`);
            
            res.status(200).json({
                success: true,
                message: `Successfully synced ${syncedCount} games`,
                synced_count: syncedCount,
                requested_count: games.length,
                database: 'sqlite'
            });
        }
        
    } catch (error) {
        console.error('❌ Server error syncing backup games:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to sync backup games'
        });
    }
});

// Health check endpoint (enhanced)
app.get('/api/health', (req, res) => {
  const envVars = {
    hasSupabaseUrl: !!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY || !!process.env.VITE_SUPABASE_ANON_KEY,
    supabaseConnected: !!supabase,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: PORT
  };

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    databases: {
      sqlite: 'connected',
      supabase: supabase ? 'connected' : 'not available'
    },
    features: {
      universalSaving: true,
      guestMode: true,
      fallbackDatabase: true
    },
    uptime: process.uptime(),
    domain: process.env.NODE_ENV === 'production' ? 'lytic.co.uk' : 'localhost',
    config: envVars
  });
});

// Input validation middleware (keeping your existing one)
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

// Enhanced Game API Routes (keeping your existing ones)
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
    console.log(`💾 Universal saving endpoints:`);
    console.log(`   📥 POST /api/save-game`);
    console.log(`   📥 POST /api/save-abandoned-game`);
    console.log(`   📦 POST /api/sync-backup-games`);
    console.log(`🗄️ Database status:`);
    console.log(`   📊 SQLite: Connected (fallback)`);
    console.log(`   🔗 Supabase: ${supabase ? 'Connected (primary)' : 'Not available'}`);
});