"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { User } from "firebase/auth";
import { auth } from "../firebase/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Return safe defaults instead of throwing error
    return {
      user: null,
      loading: false,
      error: null,
      signInWithGoogle: async () => {},
      signOut: async () => {},
      clearError: () => {}
    };
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    // Check for test mode bypass
    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.get('testMode') === 'true';
    
    if (testMode) {
      // Create a mock user for testing
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        emailVerified: true,
        // Add other required User properties with mock values
        isAnonymous: false,
        metadata: {},
        phoneNumber: null,
        providerData: [],
        providerId: 'test',
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'mock-token',
        getIdTokenResult: async () => ({ token: 'mock-token' } as any),
        reload: async () => {},
        toJSON: () => ({})
      } as unknown as User;
      
      setUser(mockUser);
      setLoading(false);
      console.log('🧪 Test mode enabled - using mock user');
      return;
    }

    if (!auth) {
      // Firebase not configured, set to demo mode
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      console.log("🔧 Firebase not configured - demo sign in");
      setError("Firebase not configured. Please check your environment variables.");
      return;
    }

    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/unauthorized-domain') {
        setError("This domain is not authorized for Firebase authentication. Please contact support.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError("Sign-in cancelled. Please try again.");
      } else if (error.code === 'auth/popup-blocked') {
        setError("Pop-up blocked. Please allow pop-ups for this site and try again.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    }
  };

  const signOut = async () => {
    // Check if we're in test mode
    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.get('testMode') === 'true';
    
    if (testMode) {
      console.log("🧪 Test mode sign out");
      setUser(null);
      // Remove testMode from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('testMode');
      window.history.replaceState({}, '', newUrl.toString());
      return;
    }
    
    if (!auth) {
      console.log("🔧 Firebase not configured - demo sign out");
      return;
    }

    try {
      setError(null);
      await firebaseSignOut(auth);
    } catch (error: any) {
      console.error("Sign-out error:", error);
      setError("Sign-out failed. Please try again.");
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    signInWithGoogle,
    signOut,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
