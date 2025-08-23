// ===== ENHANCED UNIVERSAL SAVING SYSTEM =====
let supabase = null;
let appConfig = null;
let currentUser = null;
let isSigningOut = false;
let isGuestMode = false;

// Game variables
let secretCode = [];
let turnCount = 0;
let gameWon = false;
let gameStarted = false;
let codeLength = 4;
let eliminationState = {};
let gameStartTime = null;
let gameEndTime = null;
let currentGameResult = null;

// Enhanced game variables with tracking
let gameSession = {
    sessionId: null,
    startTime: null,
    endTime: null,
    guessHistory: [],
    deviceInfo: null
};

// Rate limiting for guess submissions
let lastGuessTime = 0;
const GUESS_COOLDOWN = 500;

// Modal System
let modalResolvers = {};

// ===== INITIALIZATION =====
async function initializeApp() {
    try {
        console.log('🔧 Loading secure configuration...');
        
        // Load config from backend
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`Config load failed: ${response.status}`);
        }
        
        appConfig = await response.json();
        console.log(`✅ Config loaded: ${appConfig.environment} mode`);
        
        // Initialize Supabase with server-provided config
        supabase = window.supabase.createClient(
            appConfig.supabase.url,
            appConfig.supabase.anonKey
        );
        
        console.log('✅ Supabase initialized securely');
        
        // Initialize game session tracking
        initializeGameSession();
        
        // Load user data
        await loadUserData();

        // Show game setup by default
        setTimeout(() => {
            showGameSetup();
        }, 500);        
        
        // Background sync of any pending backup data
        setTimeout(async () => {
            if (navigator.onLine) {
                await syncLocalBackup();
            }
        }, 2000);
        
        console.log('🎮 Lytic initialized successfully with universal saving!');
        
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        showInitializationError(error);
    }
}

function showInitializationError(error) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: white;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔧</div>
                <h2>Setting up secure connection...</h2>
                <p style="margin: 1rem 0; opacity: 0.7;">
                    Please wait while we establish a secure connection to our servers.
                </p>
                <button onclick="location.reload()" 
                        style="padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

// ===== SESSION MANAGEMENT =====
function initializeGameSession() {
    gameSession.sessionId = generateSessionId();
    gameSession.deviceInfo = getDeviceInfo();
    console.log('🎮 Game session initialized:', gameSession.sessionId);
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getDeviceInfo() {
    return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenWidth: screen.width,
        screenHeight: screen.height,
        timestamp: new Date().toISOString()
    };
}

// ===== INPUT VALIDATION =====
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[^0-9]/g, '').slice(0, 7);
}

function validateGuess(input) {
    const sanitized = sanitizeInput(input);
    
    if (sanitized.length !== codeLength) {
        return { valid: false, message: `Please enter exactly ${codeLength} digits.` };
    }
    
    if (!/^\d+$/.test(sanitized)) {
        return { valid: false, message: 'Please enter only numbers.' };
    }
    
    return { valid: true, value: sanitized };
}

// ===== MODAL SYSTEM =====
function showModal(modalId, customData = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal ${modalId} not found`);
            resolve(false);
            return;
        }

        // Store resolver for this modal
        modalResolvers[modalId] = resolve;

        // Custom data handling for specific modals
        if (modalId === 'guestSignUpModal' && customData.gameResult) {
            populateGameStats(customData.gameResult);
        }

        // Show modal
        modal.classList.add('show');

        // Focus the confirm button
        const confirmBtn = modal.querySelector('.btn-confirm');
        if (confirmBtn) confirmBtn.focus();

        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal(modalId.replace('Modal', ''), false);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

function closeModal(modalType, result) {
    const modalId = modalType + 'Modal';
    const modal = document.getElementById(modalId);
    
    if (!modal) return;
    
    modal.classList.remove('show');
    
    // Call resolver if it exists
    if (modalResolvers[modalId]) {
        modalResolvers[modalId](result);
        delete modalResolvers[modalId];
    }
}

function populateGameStats(gameResult) {
    const statsDiv = document.getElementById('modalGameStats');
    if (!statsDiv || !gameResult) return;

    const timeString = gameResult.timeInSeconds >= 60 ? 
        `${Math.floor(gameResult.timeInSeconds / 60)}m ${gameResult.timeInSeconds % 60}s` :
        `${gameResult.timeInSeconds}s`;

    statsDiv.innerHTML = `
        <div><span>Score:</span><span>${gameResult.score.toLocaleString()}</span></div>
        <div><span>Time:</span><span>${timeString}</span></div>
        <div><span>Attempts:</span><span>${gameResult.attempts}</span></div>
    `;
}

// ===== GAME SETUP MODAL =====
function showGameSetup() {
    const modal = document.getElementById('gameSetupModal');
    modal.classList.add('show');
    updateDifficultyPreview();
    
    setTimeout(() => {
        document.getElementById('setupCodeLength').focus();
    }, 100);
}

function hideGameSetup() {
    const modal = document.getElementById('gameSetupModal');
    modal.classList.remove('show');
}

function updateDifficultyPreview() {
    const select = document.getElementById('setupCodeLength');
    const selectedValue = parseInt(select.value);
    const difficultyText = document.getElementById('difficultyText');
    const difficultyIndicator = document.getElementById('difficultyIndicator');
    
    const difficulties = {
        4: { text: 'Perfect for beginners', dots: 1 },
        5: { text: 'Moderate challenge', dots: 2 },
        6: { text: 'Tough but manageable', dots: 3 },
        7: { text: 'Expert level difficulty', dots: 4 }
    };
    
    const difficulty = difficulties[selectedValue];
    difficultyText.textContent = difficulty.text;
    
    // Update difficulty dots
    const dots = difficultyIndicator.querySelectorAll('.difficulty-dot');
    dots.forEach((dot, index) => {
        if (index < difficulty.dots) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function startNewGameFromModal() {
    const selectedLength = parseInt(document.getElementById('setupCodeLength').value);
    hideGameSetup();
    newGame(selectedLength);
}

// ===== GAME LOGIC =====
async function newGame(selectedLength = null) {
    // Check if there's a game in progress
    if (turnCount > 0 && !gameWon && gameStartTime) {
        const confirmed = await showModal('newGameModal');
        if (!confirmed) {
            return; // User cancelled, don't start new game
        }
    }

    // Use provided length or default to 4
    codeLength = selectedLength || 4;
    
    if (codeLength < 4 || codeLength > 7) {
        console.error('Invalid code length selected');
        return;
    }
    
    const guessInput = document.getElementById('guessInput');
    const submitBtn = document.getElementById('submitBtn');
    
    guessInput.maxLength = codeLength;
    
    secretCode = [];
    for (let i = 0; i < codeLength; i++) {
        secretCode.push(Math.floor(Math.random() * 10));
    }
    
    // Reset game state
    turnCount = 0;
    gameWon = false;
    gameStarted = true;
    gameStartTime = Date.now();
    gameEndTime = null;
    currentGameResult = null;
    
    // Initialize session for this game
    gameSession.startTime = gameStartTime;
    gameSession.guessHistory = [];
    
    // UI updates
    document.getElementById('turnCounter').textContent = turnCount;
    document.getElementById('historyBody').innerHTML = '';
    document.getElementById('feedback').textContent = `Game started! Guess the ${codeLength}-digit code.`;
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('winMessage').classList.add('hidden');
    
    // Enable input and button
    guessInput.disabled = false;
    guessInput.placeholder = 'Enter your guess';
    guessInput.value = '';
    guessInput.focus();
    submitBtn.disabled = false;
    
    initializeEliminationGrid();
    
    if (appConfig && appConfig.environment === 'development') {
        console.log('Secret code:', secretCode.join(''));
    }
}

function submitGuess() {
    if (gameWon) return;
    
    // Rate limiting
    const now = Date.now();
    if (now - lastGuessTime < GUESS_COOLDOWN) {
        console.warn('Rate limit: Please wait before submitting another guess');
        return;
    }
    lastGuessTime = now;
    
    const guessInput = document.getElementById('guessInput');
    const rawGuess = guessInput.value.trim();
    
    // Validate and sanitize input
    const validation = validateGuess(rawGuess);
    if (!validation.valid) {
        document.getElementById('feedback').textContent = validation.message;
        return;
    }
    
    const guess = validation.value;
    turnCount++;
    document.getElementById('turnCounter').textContent = turnCount;
    
    const guessArray = guess.split('').map(Number);
    let correctCount = 0;
    
    for (let i = 0; i < codeLength; i++) {
        if (guessArray[i] === secretCode[i]) {
            correctCount++;
        }
    }
    
    // Track this guess in session history
    const guessData = {
        turnNumber: turnCount,
        guess: guess,
        correctCount: correctCount,
        timestamp: now,
        timeSinceStart: now - gameStartTime
    };
    gameSession.guessHistory.push(guessData);
    
    // Add to history table
    const historyBody = document.getElementById('historyBody');
    const row = historyBody.insertRow();
    row.insertCell(0).textContent = turnCount;
    row.insertCell(1).textContent = guess;
    row.insertCell(2).textContent = correctCount;
    
    // Update feedback
    const feedbackEl = document.getElementById('feedback');
    if (correctCount === codeLength) {
        gameEndTime = Date.now();
        gameSession.endTime = gameEndTime;
        const timeInSeconds = Math.floor((gameEndTime - gameStartTime) / 1000);
        const score = calculateScore(codeLength, turnCount, timeInSeconds, true);
        
        feedbackEl.textContent = `Perfect! All ${correctCount} digits correct!`;
        feedbackEl.className = 'feedback correct';
        document.getElementById('winMessage').classList.remove('hidden');
        gameWon = true;
        
        // Prepare comprehensive game result
        currentGameResult = {
            difficulty: codeLength,
            attempts: turnCount,
            timeInSeconds: timeInSeconds,
            completed: true,
            score: score,
            secretCode: secretCode.join(''),
            finalGuess: guess,
            sessionData: gameSession
        };
        
        // Save result immediately with universal system
        setTimeout(async () => {
            await saveGameResult();
            await handleGameCompletion(currentGameResult);
        }, 200);
        
    } else {
        feedbackEl.textContent = `${correctCount} out of ${codeLength} digits correct.`;
        feedbackEl.className = 'feedback';
    }
    
    guessInput.value = '';
    guessInput.focus();
}

function calculateScore(difficulty, attempts, timeInSeconds, completed) {
    if (!completed) return 0;
    
    const baseScore = difficulty * 250;
    const attemptPenalty = Math.max(0, (attempts - difficulty) * 50);
    const timePenalty = Math.min(timeInSeconds * 2, 300);
    const difficultyBonus = difficulty * 100;
    
    return Math.max(baseScore - attemptPenalty - timePenalty + difficultyBonus, 100);
}

// ===== SAVING SYSTEM =====
async function saveGameResult() {
    if (!currentGameResult) {
        console.warn('Cannot save result - no game result available');
        return;
    }
    
    console.log('💾 Starting universal save process...');
    
    // Prepare comprehensive game data
    const gameData = {
        user_id: currentUser ? currentUser.id : null,
        session_id: gameSession.sessionId,
        difficulty: currentGameResult.difficulty,
        attempts: currentGameResult.attempts,
        time_taken: currentGameResult.timeInSeconds,
        completed: currentGameResult.completed,
        score: currentGameResult.score || 0,
        secret_code: currentGameResult.secretCode,
        final_guess: currentGameResult.finalGuess,
        is_guest: isGuestMode || !currentUser,
        device_info: gameSession.deviceInfo,
        guess_history: gameSession.guessHistory,
        game_started_at: new Date(gameSession.startTime).toISOString(),
        game_ended_at: new Date(gameSession.endTime).toISOString(),
        created_at: new Date().toISOString(),
        total_game_time: currentGameResult.timeInSeconds,
        average_time_per_guess: currentGameResult.attempts > 0 ? 
            currentGameResult.timeInSeconds / currentGameResult.attempts : 0,
        win_rate_this_session: calculateSessionWinRate(),
        browser_language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: currentGameResult.completed ? 'completed' : 'abandoned',
        abandoned: false
    };
    
    // Try multiple save methods
    const saveSuccess = await attemptSave(gameData);
    
    if (saveSuccess) {
        console.log('✅ Game result saved successfully');
        updateLocalStatsCache(gameData);
    } else {
        console.error('❌ Save failed, saving to local backup');
        saveToLocalStorage(gameData);
    }
}

async function attemptSave(gameData) {
    const methods = [
        () => saveViaSupabase(gameData),
        () => saveViaBackendAPI(gameData)
    ];
    
    for (const method of methods) {
        try {
            console.log(`🔄 Attempting save method ${methods.indexOf(method) + 1}...`);
            const result = await method();
            if (result) {
                console.log(`✅ Save successful via method ${methods.indexOf(method) + 1}`);
                return true;
            }
        } catch (error) {
            console.warn(`⚠️ Save method ${methods.indexOf(method) + 1} failed:`, error.message);
        }
    }
    return false;
}

async function saveViaSupabase(gameData) {
    if (!supabase) throw new Error('Supabase not available');
    
    const { data, error } = await supabase
        .from('game_results')
        .insert([gameData])
        .select();
    
    if (error) throw error;
    return data;
}

async function saveViaBackendAPI(gameData) {
    const response = await fetch('/api/save-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData)
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API save failed');
    }
    
    return await response.json();
}

function saveToLocalStorage(gameData) {
    try {
        const backupKey = 'lytic_backup_results';
        const existing = JSON.parse(localStorage.getItem(backupKey) || '[]');
        
        existing.push({
            ...gameData,
            backup_timestamp: Date.now()
        });
        
        // Keep only last 10 backup results
        if (existing.length > 10) {
            existing.splice(0, existing.length - 10);
        }
        
        localStorage.setItem(backupKey, JSON.stringify(existing));
        console.log('📦 Game result saved to local backup');
        
        // Schedule retry for later
        setTimeout(() => {
            if (navigator.onLine) syncLocalBackup();
        }, 30000);
        
    } catch (error) {
        console.error('Failed to save to local storage:', error);
    }
}

async function syncLocalBackup() {
    if (!supabase) return;
    
    try {
        const backupKey = 'lytic_backup_results';
        const backupData = JSON.parse(localStorage.getItem(backupKey) || '[]');
        
        if (backupData.length === 0) return;
        
        console.log(`📤 Syncing ${backupData.length} backup results...`);
        
        const response = await fetch('/api/sync-backup-games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ games: backupData })
        });
        
        if (response.ok) {
            localStorage.removeItem(backupKey);
            console.log('✅ Backup results synced successfully');
        }
        
    } catch (error) {
        console.error('Failed to sync local backup:', error);
    }
}

function calculateSessionWinRate() {
    const sessionKey = 'lytic_session_' + new Date().toDateString();
    const sessionStats = JSON.parse(sessionStorage.getItem(sessionKey) || '{"games": 0, "wins": 0}');
    
    sessionStats.games++;
    if (currentGameResult && currentGameResult.completed) {
        sessionStats.wins++;
    }
    
    sessionStorage.setItem(sessionKey, JSON.stringify(sessionStats));
    return sessionStats.games > 0 ? (sessionStats.wins / sessionStats.games) * 100 : 0;
}

function updateLocalStatsCache(gameData) {
    try {
        const cacheKey = currentUser ? `lytic_stats_${currentUser.id}` : 'lytic_guest_stats';
        const stats = JSON.parse(localStorage.getItem(cacheKey) || '{"totalGames": 0, "totalWins": 0, "totalScore": 0}');
        
        stats.totalGames++;
        if (gameData.completed) {
            stats.totalWins++;
        }
        stats.totalScore += gameData.score || 0;
        stats.lastPlayed = Date.now();
        
        localStorage.setItem(cacheKey, JSON.stringify(stats));
    } catch (error) {
        console.error('Failed to update local stats cache:', error);
    }
}

// ===== GAME COMPLETION HANDLING =====
async function handleGameCompletion(gameResult) {
    if (currentUser && !isGuestMode) {
        setTimeout(() => showSaveModal(), 500);
    } else {
        // Show guest sign up modal instead of alert
        const shouldSignIn = await showModal('guestSignUpModal', { gameResult });
        if (shouldSignIn) {
            window.location.href = 'index.html';
        }
    }
}

function showSaveModal() {
    if (!currentGameResult) return;
    
    const modal = document.getElementById('saveModal');
    const statsDiv = document.getElementById('saveStats');
    
    const timeString = currentGameResult.timeInSeconds >= 60 ? 
        `${Math.floor(currentGameResult.timeInSeconds / 60)}m ${currentGameResult.timeInSeconds % 60}s` :
        `${currentGameResult.timeInSeconds}s`;
    
    statsDiv.innerHTML = `
        <div><span>Difficulty:</span><span>${currentGameResult.difficulty} digits</span></div>
        <div><span>Attempts:</span><span>${currentGameResult.attempts}</span></div>
        <div><span>Time:</span><span>${timeString}</span></div>
        <div><span>Your Score:</span><span>${currentGameResult.score.toLocaleString()}</span></div>
    `;
    
    modal.classList.add('show');
}

function hideSaveModal() {
    document.getElementById('saveModal').classList.remove('show');
}

async function saveResult() {
    if (!currentUser || isGuestMode) {
        const shouldSignIn = await showModal('dashboardSignInModal');
        if (shouldSignIn) {
            window.location.href = 'index.html';
        }
        hideSaveModal();
        return;
    }
    
    hideSaveModal();
    
    const playAnother = await showModal('playAnotherModal');
    if (playAnother) {
        newGame();
    }
}

// ===== STRATEGY GRID =====
function initializeEliminationGrid() {
    const grid = document.getElementById('eliminationGrid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `auto repeat(${codeLength}, 1fr)`;
    
    eliminationState = {};
    
    const emptyCell = document.createElement('div');
    emptyCell.className = 'grid-header';
    grid.appendChild(emptyCell);
    
    for (let pos = 0; pos < codeLength; pos++) {
        const header = document.createElement('div');
        header.className = 'grid-header';
        header.textContent = `P${pos + 1}`;
        grid.appendChild(header);
    }
    
    for (let digit = 0; digit <= 9; digit++) {
        const rowHeader = document.createElement('div');
        rowHeader.className = 'grid-row-header';
        rowHeader.textContent = digit.toString();
        grid.appendChild(rowHeader);
        
        for (let pos = 0; pos < codeLength; pos++) {
            const cell = document.createElement('button');
            cell.className = 'grid-cell';
            cell.dataset.digit = digit;
            cell.dataset.position = pos;
            cell.onclick = () => toggleCell(digit, pos);
            grid.appendChild(cell);
            
            eliminationState[`${digit}-${pos}`] = 'unknown';
        }
    }
}

function toggleCell(digit, position) {
    const key = `${digit}-${position}`;
    const cell = document.querySelector(`[data-digit="${digit}"][data-position="${position}"]`);
    
    if (eliminationState[key] === 'unknown') {
        eliminationState[key] = 'no';
        cell.className = 'grid-cell no';
        cell.textContent = '✗';
    } else if (eliminationState[key] === 'no') {
        eliminationState[key] = 'yes';
        cell.className = 'grid-cell yes';
        cell.textContent = '✓';
    } else {
        eliminationState[key] = 'unknown';
        cell.className = 'grid-cell';
        cell.textContent = '';
    }
}

// ===== USER MANAGEMENT =====
async function loadUserData() {
    if (!supabase) {
        console.warn('Supabase not initialized yet');
        return;
    }
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const guestParam = urlParams.get('guest');
        
        if (guestParam === 'true') {
            isGuestMode = true;
            currentUser = null;
            updateProfileDisplay(null, true);
            return;
        }

        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
            console.error('Error getting user:', error);
            isGuestMode = true;
            updateProfileDisplay(null, true);
            return;
        }

        if (user) {
            isGuestMode = false;
            currentUser = user;
            updateProfileDisplay(user, false);
        } else {
            isGuestMode = true;
            updateProfileDisplay(null, true);
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
        isGuestMode = true;
        updateProfileDisplay(null, true);
    }
}

function updateProfileDisplay(user, isGuestMode = false) {
    const nameElement = document.getElementById('profileName');
    const emailElement = document.getElementById('profileEmail');
    const profileMenu = document.getElementById('profileMenu');

    if (user && !isGuestMode) {
        const displayName = user.user_metadata?.display_name || 
                         user.user_metadata?.full_name || 
                         user.email?.split('@')[0] || 
                         'User';
        nameElement.textContent = displayName;
        emailElement.textContent = user.email || 'No email';
        
        profileMenu.innerHTML = `
            <li class="profile-menu-item">
                <button class="profile-menu-link" onclick="goToHub()">
                    <span class="profile-menu-icon">🏠</span>
                    <span>Hub</span>
                </button>
            </li>
            <li class="profile-menu-item">
                <button class="profile-menu-link" onclick="showDashboard()">
                    <span class="profile-menu-icon">📊</span>
                    <span>Dashboard</span>
                </button>
            </li>
            <li class="profile-menu-item">
                <button class="profile-menu-link danger" id="signOutButton" onclick="signOut()">
                    <span class="profile-menu-icon">🚪</span>
                    <span>Sign Out</span>
                </button>
            </li>
        `;
    } else {
        nameElement.textContent = 'Guest User';
        emailElement.innerHTML = `
            Playing as Guest
            <div class="guest-indicator">GUEST MODE</div>
        `;
        
        profileMenu.innerHTML = `
            <li class="profile-menu-item">
                <button class="profile-menu-link" onclick="goToHub()">
                    <span class="profile-menu-icon">🏠</span>
                    <span>Hub</span>
                </button>
            </li>
            <li class="profile-menu-item">
                <button class="profile-menu-link primary" onclick="signInAsUser()">
                    <span class="profile-menu-icon">🔑</span>
                    <span>Sign In</span>
                </button>
            </li>
        `;
    }
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('show');
}

function goToHub() {
    if (isGuestMode) {
        window.location.href = 'hub.html?guest=true';
    } else {
        window.location.href = 'hub.html';
    }
}

async function signOut() {
    if (isSigningOut || !supabase) return;
    
    const confirmed = await showModal('signOutModal');
    if (!confirmed) {
        toggleProfileDropdown();
        return;
    }

    isSigningOut = true;
    
    try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) console.error('Supabase sign out error:', error);
        
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('index.html');
    } catch (error) {
        console.error('Error during sign out:', error);
        window.location.replace('index.html');
    } finally {
        isSigningOut = false;
    }
}

function signInAsUser() {
    window.location.href = 'index.html';
}

// ===== DASHBOARD =====
async function showDashboard() {
    if (isGuestMode) {
        const shouldSignIn = await showModal('dashboardSignInModal');
        if (shouldSignIn) {
            window.location.href = 'index.html';
        }
        toggleProfileDropdown();
        return;
    }

    if (!currentUser) {
        const shouldSignIn = await showModal('dashboardSignInModal');
        if (shouldSignIn) {
            window.location.href = 'index.html';
        }
        toggleProfileDropdown();
        return;
    }

    document.getElementById('dashboardModal').classList.add('show');
    await loadDashboard();
    toggleProfileDropdown();
}

function hideDashboard() {
    document.getElementById('dashboardModal').classList.remove('show');
}

async function loadDashboard() {
    const loadingState = document.getElementById('loadingState');
    const dashboardData = document.getElementById('dashboardData');
    const errorState = document.getElementById('errorState');

    // Show loading state
    loadingState.style.display = 'block';
    dashboardData.style.display = 'none';
    errorState.style.display = 'none';

    try {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Fetch user's game results with security check
        const { data: gameResults, error } = await supabase
            .from('game_results')
            .select('*')
            .eq('user_id', currentUser.id) // Security: Only fetch current user's data
            .order('created_at', { ascending: false })
            .limit(50); // Limit for performance

        if (error) {
            console.error('Database error:', error);
            throw new Error('Failed to fetch game data');
        }

        // Calculate and display statistics
        const stats = calculateUserStats(gameResults || []);
        updateStatsDisplay(stats);

        // Update difficulty breakdown
        updateDifficultyBreakdown(gameResults || []);

        // Update recent games table (last 10)
        updateRecentGamesTable((gameResults || []).slice(0, 10));

        // Show dashboard content
        loadingState.style.display = 'none';
        dashboardData.style.display = 'block';

    } catch (error) {
        console.error('Error loading dashboard:', error);
        
        // Show error state
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
    }
}

function calculateUserStats(gameResults) {
    const totalGames = gameResults.length;
    const completedGames = gameResults.filter(game => game.completed);
    const gamesWon = completedGames.length;
    const bestScore = gameResults.length > 0 ? Math.max(...gameResults.map(g => g.score || 0)) : 0;
    
    // Calculate best (lowest) attempts from completed games only
    const bestAttempts = completedGames.length > 0 ? 
        Math.min(...completedGames.map(game => game.attempts)) : null;
    
    const avgAttempts = completedGames.length > 0 ? 
        (completedGames.reduce((sum, game) => sum + game.attempts, 0) / completedGames.length).toFixed(1) : 0;
    const avgTime = completedGames.length > 0 ? 
        Math.round(completedGames.reduce((sum, game) => sum + game.time_taken, 0) / completedGames.length) : 0;

    return { totalGames, gamesWon, bestScore, bestAttempts, avgAttempts, avgTime };
}

function updateStatsDisplay(stats) {
    document.getElementById('totalGames').textContent = stats.totalGames;
    document.getElementById('gamesWon').textContent = stats.gamesWon;
    document.getElementById('bestAttempts').textContent = stats.bestAttempts !== null ? stats.bestAttempts : '--';
    document.getElementById('bestScore').textContent = stats.bestScore.toLocaleString();
    document.getElementById('avgAttempts').textContent = stats.avgAttempts;
    document.getElementById('avgTime').textContent = stats.avgTime + 's';
}

function updateDifficultyBreakdown(gameResults) {
    const breakdown = {};
    
    // Initialize breakdown for all difficulties
    for (let i = 4; i <= 7; i++) {
        breakdown[i] = { games: 0, won: 0, attempts: [], scores: [] };
    }

    // Process game results
    gameResults.forEach(game => {
        const difficulty = game.difficulty;
        if (breakdown[difficulty]) {
            breakdown[difficulty].games++;
            if (game.completed) {
                breakdown[difficulty].won++;
                breakdown[difficulty].attempts.push(game.attempts);
                breakdown[difficulty].scores.push(game.score || 0);
            }
        }
    });

    const container = document.getElementById('difficultyBreakdown');
    container.innerHTML = '';

    let hasData = false;

    for (let level = 4; level <= 7; level++) {
        const data = breakdown[level];
        if (data.games > 0) {
            hasData = true;
        }

        const avgAttempts = data.attempts.length > 0 ? 
            (data.attempts.reduce((sum, a) => sum + a, 0) / data.attempts.length).toFixed(1) : '0';
        const bestScore = data.scores.length > 0 ? Math.max(...data.scores) : 0;
        const winRate = data.games > 0 ? Math.round((data.won / data.games) * 100) : 0;

        const item = document.createElement('div');
        item.className = `difficulty-item level-${level}`;
        item.innerHTML = `
            <div class="difficulty-info">
                <div class="difficulty-name">${level} Digits</div>
                <div class="difficulty-stats">${data.games} games • ${winRate}% win rate • ${avgAttempts} avg attempts</div>
            </div>
            <div class="difficulty-score">${bestScore.toLocaleString()}</div>
        `;
        container.appendChild(item);
    }

    if (!hasData) {
        container.innerHTML = '<div class="no-data">No games played yet. Start playing to see your performance analytics!</div>';
    }
}

function updateRecentGamesTable(games) {
    const tbody = document.getElementById('recentGamesTable');
    tbody.innerHTML = '';

    if (games.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="6" class="no-data">No games played yet</td>';
        return;
    }

    games.forEach(game => {
        const row = tbody.insertRow();
        const date = new Date(game.created_at).toLocaleDateString();
        const time = game.time_taken ? 
            `${Math.floor(game.time_taken / 60)}:${(game.time_taken % 60).toString().padStart(2, '0')}` : '--';
        const status = game.completed ? 'Won' : 'Lost';
        const statusClass = game.completed ? 'status-won' : 'status-lost';

        row.innerHTML = `
            <td>${date}</td>
            <td>${game.difficulty} digits</td>
            <td>${game.attempts}</td>
            <td>${time}</td>
            <td>${(game.score || 0).toLocaleString()}</td>
            <td><span class="${statusClass}">${status}</span></td>
        `;
    });
}

// ===== EVENT HANDLERS =====
// Auto-save on page unload (for incomplete games)
window.addEventListener('beforeunload', function() {
    if (gameStartTime && !gameWon && turnCount > 0) {
        const abandonedData = {
            user_id: currentUser ? currentUser.id : null,
            session_id: gameSession.sessionId,
            difficulty: codeLength,
            attempts: turnCount,
            time_taken: Math.floor((Date.now() - gameStartTime) / 1000),
            completed: false,
            score: 0,
            is_guest: isGuestMode || !currentUser,
            game_started_at: new Date(gameStartTime).toISOString(),
            guess_history: gameSession.guessHistory,
            device_info: gameSession.deviceInfo,
            abandoned: true,
            abandon_reason: 'page_unload',
            status: 'abandoned',
            created_at: new Date().toISOString()
        };
        
        // Use sendBeacon for reliable sending on page unload
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(abandonedData)], { type: 'application/json' });
            navigator.sendBeacon('/api/save-abandoned-game', blob);
        } else {
            saveToLocalStorage(abandonedData);
        }
    }
});



// Close help modal when clicking overlay
const helpModal = document.getElementById('helpModal');
if (e.target === helpModal) {
    closeModal('help', false);
}


// Network status handling
window.addEventListener('online', syncLocalBackup);
window.addEventListener('offline', function() {
    console.log('🔌 Offline mode - results will be saved locally');
});

// Click event handling
document.addEventListener('click', function(e) {
    const profileContainer = document.querySelector('.profile-container');
    const dropdown = document.getElementById('profileDropdown');
    
    if (profileContainer && !profileContainer.contains(e.target)) {
        dropdown.classList.remove('show');
    }

    // Close modals when clicking overlay
    if (e.target.classList.contains('modal-overlay')) {
        const modalId = e.target.id;
        const modalType = modalId.replace('Modal', '');
        closeModal(modalType, false);
    }

    // Close game setup modal when clicking overlay
    if (e.target.classList.contains('game-setup-modal')) {
        hideGameSetup();
    }

    // Close dashboard when clicking overlay
    const dashboardModal = document.getElementById('dashboardModal');
    if (e.target === dashboardModal) {
        hideDashboard();
    }
});

// Keyboard event handling
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close profile dropdown
        document.getElementById('profileDropdown').classList.remove('show');
        
        // Close dashboard
        hideDashboard();

        // Close game setup modal
        hideGameSetup();
        
        // Close any visible modal
        const visibleModal = document.querySelector('.modal-overlay.show');
        if (visibleModal) {
            const modalType = visibleModal.id.replace('Modal', '');
            closeModal(modalType, false);
        }
    }
});

// Enter key support for game input
document.addEventListener('DOMContentLoaded', function() {
    const guessInput = document.getElementById('guessInput');
    const submitBtn = document.getElementById('submitBtn');
    
    if (guessInput) {
        // Initially disable input and button
        guessInput.disabled = true;
        guessInput.placeholder = 'Click "Reset" to start!';
        
        guessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitGuess();
            }
        });
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
    }
});

// Initialize on page load
window.addEventListener('load', initializeApp);

console.log('🎮 Enhanced universal saving system with modals loaded and ready!');


// ===== HELP MODAL =====
function showHelpModal() {
    showModal('helpModal');
}

function closeHelpAndStartGame() {
    closeModal('help', false);
    setTimeout(() => {
        showGameSetup();
    }, 300);
}