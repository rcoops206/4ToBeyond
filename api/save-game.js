// api/save-game.js - Vercel Serverless Function
import { createClient } from '@supabase/supabase-js';

// Rate limiting in memory (simple implementation)
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 30;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimitMap.get(ip);
  
  if (now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false;
  }
  
  limit.count++;
  return true;
}

function sanitizeGameData(data) {
  return {
    session_id: String(data.session_id || '').substring(0, 100),
    difficulty: Math.max(4, Math.min(7, parseInt(data.difficulty) || 4)),
    attempts: Math.max(0, parseInt(data.attempts) || 0),
    time_taken: Math.max(0, parseInt(data.time_taken) || 0),
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
    device_info: data.device_info && typeof data.device_info === 'object' ? data.device_info : null,
    guess_history: Array.isArray(data.guess_history) ? data.guess_history.slice(-20) : [],
    total_game_time: data.total_game_time ? Math.max(0, parseInt(data.total_game_time)) : null,
    average_time_per_guess: data.average_time_per_guess ? Math.max(0, parseFloat(data.average_time_per_guess)) : null,
    win_rate_this_session: data.win_rate_this_session ? Math.max(0, Math.min(100, parseFloat(data.win_rate_this_session))) : null,
    status: data.completed ? 'completed' : 'abandoned',
    created_at: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  try {
    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded'
      });
    }

    // Validate required fields
    const { session_id, difficulty, attempts, time_taken, completed, score } = req.body;
    
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'session_id is required'
      });
    }

    if (!difficulty || difficulty < 4 || difficulty > 7) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'difficulty must be between 4 and 7'
      });
    }

    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Database credentials not configured'
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Sanitize and save game data
    const sanitizedData = sanitizeGameData(req.body);
    
    console.log('💾 Saving game result:', {
      session_id: sanitizedData.session_id,
      difficulty: sanitizedData.difficulty,
      completed: sanitizedData.completed,
      is_guest: sanitizedData.is_guest
    });

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

    console.log('✅ Game saved successfully:', data[0]?.id);

    res.status(200).json({
      success: true,
      message: 'Game saved successfully',
      id: data[0]?.id,
      database: 'supabase'
    });

  } catch (error) {
    console.error('❌ Server error saving game:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save game'
    });
  }
}