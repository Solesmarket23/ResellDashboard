// Session management utility for handling idle timeout and remember me functionality

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export class SessionManager {
  private lastActivityTime: number;
  private idleTimer: NodeJS.Timeout | null = null;
  private onIdleCallback: (() => void) | null = null;

  constructor() {
    this.lastActivityTime = Date.now();
    this.initializeActivityTracking();
  }

  private initializeActivityTracking() {
    if (typeof window === 'undefined') return;

    // Seed lastActivity on startup so reopening the app doesn't immediately invalidate the session.
    // (Previously, lastActivity was only set after the first user interaction event.)
    try {
      const existing = localStorage.getItem('lastActivity');
      if (!existing) {
        localStorage.setItem('lastActivity', this.lastActivityTime.toString());
      } else {
        const parsed = Number.parseInt(existing, 10);
        if (Number.isFinite(parsed)) this.lastActivityTime = parsed;
      }
    } catch {
      // Ignore storage failures; session validity will fall back to in-memory time.
    }

    // Track user activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    activityEvents.forEach(event => {
      window.addEventListener(event, () => this.updateActivity(), { passive: true });
    });

    // Check for idle timeout periodically
    this.startIdleCheck();
  }

  private updateActivity() {
    this.lastActivityTime = Date.now();
    localStorage.setItem('lastActivity', this.lastActivityTime.toString());
    
    // Reset idle timer
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.startIdleCheck();
    }
  }

  private startIdleCheck() {
    // Check every minute if user is idle
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - this.lastActivityTime;
      
      if (timeSinceLastActivity >= IDLE_TIMEOUT_MS) {
        this.handleIdleTimeout();
      }
    }, 60000); // Check every minute
  }

  private handleIdleTimeout() {
    if (this.onIdleCallback) {
      this.onIdleCallback();
    }
  }

  public setIdleCallback(callback: () => void) {
    this.onIdleCallback = callback;
  }

  public checkSessionValidity(): boolean {
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    const lastActivity = localStorage.getItem('lastActivity');
    
    // If there's no stored activity yet, don't force sign-out — treat as valid and seed now.
    if (!lastActivity) {
      this.lastActivityTime = Date.now();
      try {
        localStorage.setItem('lastActivity', this.lastActivityTime.toString());
      } catch {
        // ignore
      }
      return true;
    }
    
    const lastActivityTime = parseInt(lastActivity, 10);
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime;
    
    // If remember me is enabled, check if within 30 days
    if (rememberMe) {
      return timeSinceLastActivity < REMEMBER_ME_DURATION_MS;
    }
    
    // Otherwise, only valid within idle timeout period
    return timeSinceLastActivity < IDLE_TIMEOUT_MS;
  }

  public clearSession() {
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('lastActivity');
    
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  public destroy() {
    this.clearSession();
    this.onIdleCallback = null;
  }
}

// Singleton instance
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance && typeof window !== 'undefined') {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance!;
}