let secretCode = '';
let codeLength = 4;
let gameWon = false;
let turnCount = 0;
let guessHistory = [];
let gameStartTime = null;
let currentSessionId = null;

function newGame() {
    codeLength = parseInt(document.getElementById('codeLength').value);
    secretCode = generateSecretCode(codeLength);
    gameWon = false;
    turnCount = 0;
    guessHistory = [];
    gameStartTime = Date.now();
    currentSessionId = null;
    
    // Start new game session with backend
    startGameSession();
    
    updateUI();
    document.getElementById('feedback').textContent = `🎯 New ${codeLength}-digit code generated! Start guessing!`;
    document.getElementById('winMessage').classList.add('hidden');
    document.getElementById('guessInput').disabled = false;
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('guessInput').focus();
    
    // Reset elimination grid
    resetEliminationGrid();
    
    console.log('Secret code:', secretCode); // For testing - remove in production
}

function generateSecretCode(length) {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10).toString();
    }
    return code;
}

function submitGuess() {
    if (gameWon) return;
    
    const guess = document.getElementById('guessInput').value.trim();
    
    // Validate input
    if (!validateGuess(guess)) {
        return;
    }
    
    turnCount++;
    const correctCount = calculateExactMatches(guess, secretCode);
    
    // Store guess in history
    guessHistory.push({ 
        turn: turnCount, 
        guess: guess, 
        correct: correctCount 
    });
    
    // Update UI
    updateHistory();
    updateTurnCounter();
    
    // Check win condition
    if (correctCount === codeLength) {
        gameWon = true;
        const duration = Math.round((Date.now() - gameStartTime) / 1000);
        
        // Save winning game to backend
        saveGameResult(codeLength, turnCount, true, duration);
        
        document.getElementById('feedback').textContent = `🎊 PERFECT! All ${correctCount} digits in correct positions!`;
        document.getElementById('feedback').className = 'text-xl font-semibold mt-6 p-4 rounded-xl bg-green-500/20 border-2 border-green-400/50 min-h-16 flex items-center justify-center text-green-100';
        document.getElementById('winMessage').classList.remove('hidden');
        document.getElementById('guessInput').disabled = true;
        document.getElementById('submitBtn').disabled = true;
    } else {
        // Show feedback for partial matches
        const message = correctCount === 0 
            ? '❌ No digits in correct positions' 
            : `🎯 ${correctCount} digit${correctCount !== 1 ? 's' : ''} in correct position${correctCount !== 1 ? 's' : ''}`;
        
        document.getElementById('feedback').textContent = message;
        document.getElementById('feedback').className = 'text-xl font-semibold mt-6 p-4 rounded-xl bg-white/20 border-2 border-white/30 min-h-16 flex items-center justify-center';
    }
    
    // Clear input and focus for next guess
    document.getElementById('guessInput').value = '';
    if (!gameWon) {
        document.getElementById('guessInput').focus();
    }
}

function validateGuess(guess) {
    // Check if empty
    if (!guess) {
        showFeedback('❌ Please enter a guess', 'error');
        return false;
    }
    
    // Check length
    if (guess.length !== codeLength) {
        showFeedback(`❌ Guess must be exactly ${codeLength} digits long`, 'error');
        return false;
    }
    
    // Check if only digits
    if (!/^\d+$/.test(guess)) {
        showFeedback('❌ Only numbers (0-9) are allowed', 'error');
        return false;
    }
    
    // Check for duplicate entries (optional - remove if duplicates should be allowed)
    if (guessHistory.some(entry => entry.guess === guess)) {
        showFeedback('❌ You already tried this combination', 'error');
        return false;
    }
    
    return true;
}

function calculateExactMatches(guess, secret) {
    let exactMatches = 0;
    
    // Count only exact position matches (Exact Match game rule)
    for (let i = 0; i < guess.length; i++) {
        if (guess[i] === secret[i]) {
            exactMatches++;
        }
    }
    
    return exactMatches;
}

function showFeedback(message, type = 'info') {
    const feedbackElement = document.getElementById('feedback');
    feedbackElement.textContent = message;
    
    if (type === 'error') {
        feedbackElement.className = 'text-xl font-semibold mt-6 p-4 rounded-xl bg-red-500/20 border-2 border-red-400/50 min-h-16 flex items-center justify-center text-red-100';
    } else {
        feedbackElement.className = 'text-xl font-semibold mt-6 p-4 rounded-xl bg-white/20 border-2 border-white/30 min-h-16 flex items-center justify-center';
    }
}

// Backend API functions
async function startGameSession() {
    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                codeLength: codeLength
            })
        });
        const result = await response.json();
        if (result.success) {
            currentSessionId = result.sessionId;
            console.log('Game session started:', currentSessionId);
        }
    } catch (error) {
        console.error('Error starting game session:', error);
    }
}

async function saveGameResult(codeLength, totalGuesses, won, duration) {
    try {
        const response = await fetch('/api/game/complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId: currentSessionId,
                codeLength,
                totalGuesses,
                won,
                duration
            })
        });
        const result = await response.json();
        console.log('Game saved:', result);
        
        // Optionally load and display updated stats
        loadGameStats();
    } catch (error) {
        console.error('Error saving game:', error);
    }
}

async function loadGameStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        console.log('Current stats:', stats);
        // You can display these stats in the UI if desired
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// UI Update Functions
function updateUI() {
    updateEliminationGrid();
    updateHistory();
    updateTurnCounter();
    updateInputConstraints();
}

function updateInputConstraints() {
    const guessInput = document.getElementById('guessInput');
    guessInput.maxLength = codeLength;
    guessInput.placeholder = `Enter ${codeLength} digits...`;
    
    // Add input filter to only allow numbers
    guessInput.addEventListener('input', function(e) {
        // Remove any non-digit characters
        this.value = this.value.replace(/[^0-9]/g, '');
        
        // Limit to code length
        if (this.value.length > codeLength) {
            this.value = this.value.slice(0, codeLength);
        }
    });
}

function updateEliminationGrid() {
    const container = document.getElementById('eliminationGrid');
    container.innerHTML = '';
    
    // Header row
    const headerCell = createGridElement('div', 'bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-center py-3 px-2 text-sm', 'Digit');
    container.appendChild(headerCell);
    
    for (let pos = 1; pos <= codeLength; pos++) {
        const posHeader = createGridElement('div', 'bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-center py-3 px-2 text-sm', `Pos ${pos}`);
        container.appendChild(posHeader);
    }
    
    // Data rows for digits 0-9
    for (let digit = 0; digit <= 9; digit++) {
        // Row label
        const rowLabel = createGridElement('div', 'bg-gray-500 text-white font-bold text-center py-3 px-2 text-sm', digit.toString());
        container.appendChild(rowLabel);
        
        // Cells for each position
        for (let pos = 0; pos < codeLength; pos++) {
            const cell = createGridElement('div', 'bg-white cursor-pointer hover:bg-blue-50 flex items-center justify-center py-3 px-2 font-semibold text-sm transition-all hover:scale-105 min-h-[40px] border border-gray-100', '');
            cell.onclick = () => toggleCellState(cell, digit, pos);
            cell.id = `cell-${digit}-${pos}`;
            cell.dataset.state = 'empty'; // Track state: empty, eliminated, possible
            container.appendChild(cell);
        }
    }
    
    // Set grid layout
    container.style.gridTemplateColumns = `70px repeat(${codeLength}, 1fr)`;
}

function resetEliminationGrid() {
    // Reset all elimination grid cells to default state
    for (let digit = 0; digit <= 9; digit++) {
        for (let pos = 0; pos < codeLength; pos++) {
            const cell = document.getElementById(`cell-${digit}-${pos}`);
            if (cell) {
                setCellState(cell, 'empty');
            }
        }
    }
}

function createGridElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

function toggleCellState(cell, digit, position) {
    const currentState = cell.dataset.state || 'empty';
    
    // 3-state cycle: empty → eliminated → possible → empty
    switch (currentState) {
        case 'empty':
            setCellState(cell, 'eliminated');
            break;
        case 'eliminated':
            setCellState(cell, 'possible');
            break;
        case 'possible':
            setCellState(cell, 'empty');
            break;
        default:
            setCellState(cell, 'empty');
    }
}

function setCellState(cell, state) {
    // Remove all state classes
    cell.classList.remove(
        'bg-white', 'bg-red-100', 'bg-green-100',
        'text-red-600', 'text-green-600', 'text-gray-400'
    );
    
    // Set new state
    cell.dataset.state = state;
    
    switch (state) {
        case 'eliminated':
            cell.classList.add('bg-red-100', 'text-red-600');
            cell.textContent = '✗';
            break;
        case 'possible':
            cell.classList.add('bg-green-100', 'text-green-600');
            cell.textContent = '✓';
            break;
        case 'empty':
        default:
            cell.classList.add('bg-white', 'text-gray-400');
            cell.textContent = '';
            break;
    }
}

function updateHistory() {
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';
    
    // Show most recent guesses first
    const reversedHistory = [...guessHistory].reverse();
    
    reversedHistory.forEach(entry => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100';
        
        // Add visual indicator for perfect matches
        const isWinningGuess = entry.correct === codeLength;
        const correctCellClass = isWinningGuess 
            ? 'py-3 px-3 text-center font-bold text-green-600 text-lg bg-green-50'
            : 'py-3 px-3 text-center font-bold text-blue-600 text-lg';
        
        row.innerHTML = `
            <td class="py-3 px-3 text-center font-medium ${isWinningGuess ? 'bg-green-50' : ''}">${entry.turn}</td>
            <td class="py-3 px-3 text-center font-mono font-bold text-lg tracking-wider ${isWinningGuess ? 'bg-green-50 text-green-800' : ''}">${entry.guess}</td>
            <td class="${correctCellClass}">${entry.correct}${isWinningGuess ? ' 🎉' : ''}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Show message if no guesses yet
    if (guessHistory.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="3" class="py-6 text-center text-gray-500 italic">No guesses yet - start playing!</td>
        `;
        tbody.appendChild(row);
    }
}

function updateTurnCounter() {
    document.getElementById('turnCounter').textContent = turnCount;
}

function confirmReset() {
    if (turnCount > 0) {
        if (confirm('🔄 Are you sure you want to reset the game? All progress will be lost.')) {
            newGame();
        }
    } else {
        newGame();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    const guessInput = document.getElementById('guessInput');
    const codeLengthSelect = document.getElementById('codeLength');
    
    // Enter key submission
    guessInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitGuess();
        }
    });
    
    // Code length change handler
    codeLengthSelect.addEventListener('change', function() {
        if (secretCode !== '') {
            if (confirm('Changing code length will start a new game. Continue?')) {
                newGame();
            } else {
                this.value = codeLength;
            }
        }
    });
    
    // Focus input on page load
    guessInput.focus();
});

// Initialize the game when page loads
newGame();