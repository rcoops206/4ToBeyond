// api/save-abandoned-game.js - Vercel Serverless Function
import { createClient } from '@supabase/supabase-js';

function sanitizeGameData(data) {
  return {
    session_id: String(data.session_id || '').substring(0, 100),
    difficulty: Math.max(4, Math.min(7, parseInt(data.difficulty) || 4)),
    attempts: Math.max(0, parseInt(data.attempts) || 0),
    time_taken: Math.max(0, parseInt(data.time_taken) || 0),
    completed: false, // Always false for abandoned games
    score: 0, // Always 0 for abandoned games
    secret_code: data.secret_code ? String(data.secret_code).replace(/[^0-9]/g, '').substring(0, 7) : null,
    final_guess: null, // No final guess for abandoned games
    user_id: data.user_id || null,
    is_guest: Boolean(data.is_guest),
    game_started_at: data.game_started_at ? new Date(data.game_started_at).toISOString() : new Date().toISOString(),
    game_ended_at: null, // No end time for abandoned games
    browser_language: data.browser_language ? String(data.browser_language).substring(0, 10) : null,
    timezone: data.timezone ? String(data.timezone).substring(0, 50) : null,
    abandoned: true, // Always true
    abandon_reason: data.abandon_reason ? String(data.abandon_reason).substring(0, 50) : 'unknown',
    device_info: data.device_info && typeof data.device_info === 'object' ? data.device_info : null,
    guess_history: Array.isArray(data.guess_history) ? data.guess_history.slice(-20) : [],
    status: 'abandoned',
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
    // Basic validation
    const { session_id, difficulty } = req.body;
    
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'session_id is required'
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

    // Sanitize and save abandoned game data
    const sanitizedData = sanitizeGameData(req.body);
    
    console.log('📥 Saving abandoned game:', {
      session_id: sanitizedData.session_id,
      difficulty: sanitizedData.difficulty,
      abandon_reason: sanitizedData.abandon_reason
    });

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

    console.log('✅ Abandoned game saved successfully:', data[0]?.id);

    res.status(200).json({
      success: true,
      message: 'Abandoned game saved successfully',
      id: data[0]?.id,
      database: 'supabase'
    });

  } catch (error) {
    console.error('❌ Server error saving abandoned game:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save abandoned game'
    });
  }
}