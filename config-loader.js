// config-loader.js - Secure configuration loader for lytic.co.uk
class ServerConfigLoader {
  constructor() {
    this.config = null;
    this.loaded = false;
    this.loading = false;
    this.cache_duration = 5 * 60 * 1000; // 5 minutes
    this.last_loaded = null;
  }

  async loadConfig() {
    // Return cached config if still valid
    if (this.loaded && this.config && this.last_loaded) {
      const now = Date.now();
      if (now - this.last_loaded < this.cache_duration) {
        return this.config;
      }
    }

    // Prevent multiple simultaneous loads
    if (this.loading) {
      return new Promise((resolve) => {
        const checkLoaded = () => {
          if (!this.loading) {
            resolve(this.config);
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }

    this.loading = true;

    try {
      console.log('🔧 Loading configuration from server...');
      
      const baseUrl = this.getApiBaseUrl();
      const configUrl = `${baseUrl}/api/config`;
      
      console.log(`📡 Fetching config from: ${configUrl}`);

      const response = await fetch(configUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const config = await response.json();
      
      // Validate the config
      if (!this.validateConfig(config)) {
        throw new Error('Invalid configuration received from server');
      }

      this.config = config;
      this.loaded = true;
      this.last_loaded = Date.now();
      
      console.log(`✅ Configuration loaded successfully (${config.environment} mode on ${config.domain})`);
      return this.config;

    } catch (error) {
      console.warn('⚠️ Failed to load server config, using fallback:', error);
      this.config = this.getFallbackConfig();
      this.loaded = true;
      this.last_loaded = Date.now();
      return this.config;
    } finally {
      this.loading = false;
    }
  }

  getApiBaseUrl() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Check if we're on the production domain
    if (hostname === 'lytic.co.uk' || hostname === 'www.lytic.co.uk') {
      return `${protocol}//${hostname}`;
    }
    
    // Development detection
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168')) {
      return 'http://localhost:3000';
    }
    
    // Vercel preview URLs or other deployments
    return `${protocol}//${hostname}`;
  }

  validateConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (!config.supabase || !config.supabase.url || !config.supabase.anonKey) return false;
    if (!config.environment) return false;
    if (!config.domain) return false;
    return true;
  }

  getFallbackConfig() {
    console.warn('🚨 Using fallback configuration - some features may not work correctly');
    
    const hostname = window.location.hostname;
    const isProduction = hostname === 'lytic.co.uk' || hostname === 'www.lytic.co.uk';
    
    return {
      supabase: {
        url: 'https://cbwtexsbwzflmgbwzvpp.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNid3RleHNid3pmbG1nYnd6dnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNjU1MTUsImV4cCI6MjA2ODk0MTUxNX0.p4I1mFfNS6b23vYrmjFwSyqZ8_QEcwD_k1paY3iZbm0'
      },
      features: {
        analytics: isProduction,
        debugging: !isProduction,
        guestMode: true,
        localDatabase: true,
        vercelAnalytics: isProduction
      },
      apiUrl: window.location.origin,
      database: 'sqlite',
      domain: hostname,
      environment: isProduction ? 'production-fallback' : 'development-fallback',
      timestamp: new Date().toISOString()
    };
  }

  getConfig() {
    if (!this.loaded || !this.config) {
      throw new Error('Config not loaded yet. Call loadConfig() first.');
    }
    return this.config;
  }

  async refreshConfig() {
    this.loaded = false;
    this.last_loaded = null;
    return await this.loadConfig();
  }
}

// Enhanced App Initializer for lytic.co.uk
class LyticAppInitializer {
  constructor() {
    this.configLoader = new ServerConfigLoader();
    this.supabase = null;
    this.config = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return { supabase: this.supabase, config: this.config };
    }

    try {
      console.log('🎮 Initializing Lytic on lytic.co.uk...');
      
      // Show loading state
      this.updateLoadingState('Loading secure configuration...');
      
      // Load configuration from server
      this.config = await this.configLoader.loadConfig();
      console.log('✅ Configuration loaded');

      this.updateLoadingState('Connecting to Supabase...');
      
      // Initialize Supabase with loaded config
      this.supabase = window.supabase.createClient(
        this.config.supabase.url,
        this.config.supabase.anonKey
      );
      console.log('✅ Supabase initialized');

      this.updateLoadingState('Setting up security...');
      
      // Set global references
      window.supabase = this.supabase;
      window.appConfig = this.config;

      // Initialize security features
      this.initializeSecurity();
      console.log('✅ Security features initialized');

      this.updateLoadingState('Finalizing...');
      
      // Initialize analytics if enabled
      if (this.config.features.vercelAnalytics && this.config.environment === 'production') {
        console.log('📊 Vercel Analytics enabled');
      }

      // Hide loading screen and show app
      this.showApp();
      
      console.log(`🚀 Lytic initialized successfully in ${this.config.environment} mode on ${this.config.domain}`);
      
      this.initialized = true;
      return { supabase: this.supabase, config: this.config };

    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      this.showError(error);
      throw new Error(`Application initialization failed: ${error.message}`);
    }
  }

  updateLoadingState(message) {
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    
    if (loadingSubtext) {
      loadingSubtext.textContent = message;
    }
  }

  showApp() {
    const loadingScreen = document.getElementById('loadingScreen');
    const appContent = document.getElementById('appContent');
    
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
    
    if (appContent) {
      appContent.classList.add('ready');
    }
    
    // Show environment badge in development
    if (this.config && this.config.environment.includes('development')) {
      const envBadge = document.getElementById('envBadge');
      if (envBadge) {
        envBadge.textContent = `DEV MODE - ${this.config.domain}`;
        envBadge.style.display = 'block';
      }
    }
  }

  showError(error) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="text-align: center; color: white; max-width: 500px;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🚧</div>
          <h2 style="margin-bottom: 1rem;">Lytic is starting up...</h2>
          <p style="margin-bottom: 2rem; color: rgba(255,255,255,0.7);">
            We're setting up the secure environment. If this message persists, please refresh the page.
          </p>
          <button onclick="location.reload()" 
                  style="padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
            Refresh Page
          </button>
          <details style="margin-top: 2rem; text-align: left;">
            <summary style="cursor: pointer; color: rgba(255,255,255,0.5);">Technical Details</summary>
            <pre style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; margin-top: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.7);">${error.message}</pre>
          </details>
        </div>
      `;
    }
  }

  initializeSecurity() {
    // Add security headers via meta tags
    this.addSecurityMetaTags();
    
    // Set up monitoring
    this.setupSecurityMonitoring();
  }

  addSecurityMetaTags() {
    const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!existingCSP) {
      const csp = document.createElement('meta');
      csp.httpEquiv = 'Content-Security-Policy';
      
      const isProduction = this.config.domain === 'lytic.co.uk';
      csp.content = isProduction
        ? "default-src 'self' https://lytic.co.uk; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://*.supabase.co https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://vitals.vercel-analytics.com; img-src 'self' data: https:; frame-ancestors 'none';"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co; img-src 'self' data: https:;";
      
      document.head.appendChild(csp);
    }
  }

  setupSecurityMonitoring() {
    // Monitor for suspicious activity
    let requestCount = 0;
    const startTime = Date.now();
    
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      requestCount++;
      
      if (requestCount > 100 && (Date.now() - startTime) < 60000) {
        console.warn('🚨 Suspicious request pattern detected');
        // In production, you might want to report this
      }
      
      return originalFetch.apply(this, args);
    };
  }

  isReady() {
    return this.initialized && this.supabase && this.config;
  }
}

// Global app initializer
const lyticApp = new LyticAppInitializer();

// Initialize on page load
window.addEventListener('load', async () => {
  try {
    await lyticApp.initialize();
    
    // Your existing initialization code here
    if (typeof loadUserData === 'function') {
      await loadUserData();
    }
    
    console.log('🎮 Lytic is ready to play on lytic.co.uk!');
  } catch (error) {
    console.error('Failed to start Lytic application:', error);
  }
});

// Export for use in other scripts
window.lyticApp = lyticApp;
window.appInitializer = lyticApp; // Backward compatibility