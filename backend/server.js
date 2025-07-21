const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '../')));
app.use('/frontend/dist', express.static(path.join(__dirname, '../frontend/dist')));
app.use('/frontend/src', express.static(path.join(__dirname, '../frontend/src')));

// Database setup
const dbPath = path.join(__dirname, 'games.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_length INTEGER,
            total_guesses INTEGER,
            won BOOLEAN,
            duration_seconds INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// API Routes
app.post('/api/game/start', (req, res) => {
    const { codeLength } = req.body;
    const sessionId = Date.now().toString();
    res.json({ success: true, sessionId });
});

app.post('/api/game/complete', (req, res) => {
    const { sessionId, codeLength, totalGuesses, won, duration } = req.body;
    
    db.run(
        'INSERT INTO games (code_length, total_guesses, won, duration_seconds) VALUES (?, ?, ?, ?)',
        [codeLength, totalGuesses, won ? 1 : 0, duration],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, gameId: this.lastID });
        }
    );
});

app.get('/api/stats', (req, res) => {
    db.all(`
        SELECT 
            COUNT(*) as total_games,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as total_wins,
            ROUND(AVG(CASE WHEN won = 1 THEN total_guesses ELSE NULL END), 1) as avg_guesses,
            MIN(CASE WHEN won = 1 THEN total_guesses ELSE NULL END) as best_score
        FROM games
    `, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        const stats = rows[0];
        const winRate = stats.total_games > 0 ? 
            Math.round((stats.total_wins / stats.total_games) * 100) : 0;
        
        res.json({
            ...stats,
            win_rate: winRate
        });
    });
});

// Catch all handler: send back index.html for any non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, '../')}`);
});