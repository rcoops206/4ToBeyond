// UPDATED api/config.js - Using NEW Supabase API Key Format
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      // NEW API KEY FORMAT - Use publishable key for frontend
      const supabaseUrl = process.env.SUPABASE_URL || 'https://cbwtexsbwzflmgbwzvpp.supabase.co';
      const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fkRPbjI9oLx6ylOBB9Ryqw__ig_qRqX';
      
      // Validate new key format
      if (!supabasePublishableKey.startsWith('sb_publishable_')) {
        console.error('❌ Invalid publishable key format');
        return res.status(500).json({
          error: 'Invalid API key format',
          details: 'Please use the new publishable key format (starts with sb_publishable_)',
          timestamp: new Date().toISOString()
        });
      }

      const config = {
        supabase: {
          url: supabaseUrl,
          // Use publishable key for frontend (replaces anon key)
          anonKey: supabasePublishableKey,
          publishableKey: supabasePublishableKey // New format
        },
        features: {
          analytics: true,
          debugging: process.env.NODE_ENV !== 'production',
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
        version: '1.1.0',
        keyFormat: 'new', // Indicates we're using new key format
        debug: process.env.NODE_ENV !== 'production' ? {
          keyType: 'publishable',
          keyValid: supabasePublishableKey.startsWith('sb_publishable_')
        } : undefined
      };

      // Set cache headers
      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=300');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
      
      console.log('✅ Config served with NEW API key format');
      console.log('🔑 Using publishable key:', supabasePublishableKey.substring(0, 25) + '...');
      
      res.status(200).json(config);
      
    } catch (error) {
      console.error('❌ Error serving config:', error);
      res.status(500).json({
        error: 'Failed to load configuration',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['GET'] 
    });
  }
}

// UPDATED config-loader.js - Supporting NEW API Key Format
(async function() {
    'use strict';
    
    console.log('🎮 Initializing Lytic with NEW Supabase API keys...');
    
    class NewFormatConfigLoader {
        constructor() {
            this.config = null;
            this.loaded = false;
        }

        async loadConfig() {
            try {
                console.log('🔧 Loading configuration with new API key format...');
                
                const baseUrl = this.getApiBaseUrl();
                const configUrl = `${baseUrl}/api/config`;
                
                console.log(`📡 Fetching config from: ${configUrl}`);

                const response = await fetch(configUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    signal: AbortSignal.timeout(15000)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                const config = await response.json();
                
                if (!this.validateNewFormatConfig(config)) {
                    throw new Error('Invalid configuration received');
                }

                this.config = config;
                this.loaded = true;
                
                console.log(`✅ Configuration loaded with ${config.keyFormat || 'new'} key format`);
                return this.config;

            } catch (error) {
                console.warn('⚠️ Server config failed, using fallback:', error.message);
                this.config = this.getNewFormatFallbackConfig();
                this.loaded = true;
                return this.config;
            }
        }

        validateNewFormatConfig(config) {
            if (!config || typeof config !== 'object') return false;
            if (!config.supabase || !config.supabase.url) return false;
            
            // Check for either old or new key format
            const hasValidKey = config.supabase.anonKey || config.supabase.publishableKey;
            if (!hasValidKey) return false;
            
            return true;
        }

        getNewFormatFallbackConfig() {
            console.log('🔄 Using NEW format fallback configuration');
            
            const hostname = window.location.hostname;
            const isProduction = hostname === 'lytic.co.uk';
            
            return {
                supabase: {
                    url: 'https://cbwtexsbwzflmgbwzvpp.supabase.co',
                    // NEW FORMAT: Use publishable key
                    anonKey: 'sb_publishable_fkRPbjI9oLx6ylOBB9Ryqw__ig_qRqX',
                    publishableKey: 'sb_publishable_fkRPbjI9oLx6ylOBB9Ryqw__ig_qRqX'
                },
                features: {
                    analytics: isProduction,
                    debugging: !isProduction,
                    guestMode: true,
                    localDatabase: false,
                    vercelAnalytics: isProduction
                },
                apiUrl: window.location.origin,
                database: 'supabase',
                domain: hostname,
                environment: isProduction ? 'production-new-keys' : 'development-new-keys',
                timestamp: new Date().toISOString(),
                keyFormat: 'new',
                fallback: true
            };
        }

        getApiBaseUrl() {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            if (hostname === 'lytic.co.uk' || hostname === 'www.lytic.co.uk') {
                return `${protocol}//${hostname}`;
            }
            
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'http://localhost:3000';
            }
            
            return `${protocol}//${hostname}`;
        }
    }

    // Enhanced Supabase initialization for new key format
    async function initializeSupabaseWithNewKeys(config) {
        try {
            if (!window.supabase) {
                throw new Error('Supabase library not loaded');
            }
            
            console.log('🔗 Initializing Supabase with NEW key format...');
            
            // Use the appropriate key (publishableKey or anonKey)
            const apiKey = config.supabase.publishableKey || config.supabase.anonKey;
            
            console.log('🌐 URL:', config.supabase.url);
            console.log('🔑 Key type:', apiKey.startsWith('sb_publishable_') ? 'NEW Publishable' : 'Legacy/Other');
            console.log('🔑 Key preview:', apiKey.substring(0, 30) + '...');
            
            // Validate new key format
            if (!apiKey.startsWith('sb_publishable_')) {
                console.warn('⚠️ Not using new publishable key format');
            }
            
            // Create Supabase client
            const supabaseClient = window.supabase.createClient(
                config.supabase.url,
                apiKey,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: false,
                        storage: window.localStorage,
                        storageKey: 'lytic-auth-token'
                    },
                    global: {
                        headers: {
                            'X-Client-Info': 'lytic-web-app-v2',
                            'apikey': apiKey
                        }
                    },
                    db: {
                        schema: 'public'
                    }
                }
            );
            
            // Test the connection
            await testNewFormatConnection(supabaseClient);
            
            // Make globally available
            window.supabaseClient = supabaseClient;
            window.supabase = supabaseClient;
            
            console.log('✅ Supabase initialized successfully with new key format');
            return supabaseClient;
            
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);
            throw error;
        }
    }

    // Test connection with new format
    async function testNewFormatConnection(client) {
        try {
            console.log('🧪 Testing connection with new API key format...');
            
            // Test auth endpoint
            const { data, error } = await client.auth.getSession();
            
            if (error) {
                if (error.message.includes('Legacy API keys')) {
                    throw new Error('❌ Still using legacy keys! Please ensure you are using the new publishable key.');
                }
                
                if (error.message.includes('Invalid API key')) {
                    throw new Error('❌ Invalid publishable key! Please check your configuration.');
                }
                
                // Other auth errors are likely OK (no session, etc.)
                console.log('ℹ️ Auth response:', error.message);
            }
            
            console.log('✅ New format connection test passed');
            return true;
            
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            throw error;
        }
    }

    // Main initialization
    async function initialize() {
        try {
            const configLoader = new NewFormatConfigLoader();
            
            updateLoadingState('Loading with new API key format...');
            const config = await configLoader.loadConfig();
            
            updateLoadingState('Connecting to Supabase...');
            const supabase = await initializeSupabaseWithNewKeys(config);
            
            updateLoadingState('Finalizing setup...');
            
            // Make config globally available
            window.appConfig = config;
            
            // Show success
            showApp(config);
            
            console.log(`🚀 Lytic initialized successfully with NEW key format in ${config.environment} mode`);
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('lytic-ready', { 
                detail: { config, supabase, keyFormat: 'new' } 
            }));
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            showError(error);
        }
    }

    function updateLoadingState(message) {
        const loadingSubtext = document.querySelector('.loading-subtext');
        if (loadingSubtext) {
            loadingSubtext.textContent = message;
        }
    }

    function showApp(config) {
        const loadingScreen = document.getElementById('loadingScreen');
        const appContent = document.getElementById('appContent');
        
        if (loadingScreen) loadingScreen.style.display = 'none';
        if (appContent) appContent.classList.add('ready');
        
        // Show key format badge
        const envBadge = document.getElementById('envBadge');
        if (envBadge && config.keyFormat === 'new') {
            envBadge.textContent = `NEW KEYS - ${config.environment}`;
            envBadge.style.background = '#10b981'; // Green for new format
            envBadge.style.display = 'block';
        }
    }

    function showError(error) {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div style="text-align: center; color: white; max-width: 600px; padding: 2rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">${error.message.includes('Legacy') ? '🔄' : '🔧'}</div>
                    <h2 style="margin-bottom: 1rem; color: #ffffff;">
                        ${error.message.includes('Legacy') ? 'Key Format Update Needed' : 'Configuration Issue'}
                    </h2>
                    <p style="margin-bottom: 2rem; color: rgba(255,255,255,0.8); line-height: 1.6;">
                        ${error.message.includes('Legacy') 
                            ? 'Please make sure you are using the new publishable key format (starts with sb_publishable_).'
                            : 'There was an issue with the configuration. Please check your API keys and try again.'
                        }
                    </p>
                    <button onclick="location.reload()" 
                            style="padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 1rem; font-weight: 600;">
                        Retry
                    </button>
                    <details style="margin-top: 2rem; text-align: left;">
                        <summary style="cursor: pointer; color: rgba(255,255,255,0.6);">Technical Details</summary>
                        <pre style="background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 8px; font-size: 0.8rem; color: rgba(255,255,255,0.8); white-space: pre-wrap; word-wrap: break-word;">${error.message}</pre>
                    </details>
                </div>
            `;
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    console.log('🎮 NEW format configuration system loaded');
})();