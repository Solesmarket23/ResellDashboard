"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { User } from "firebase/auth";
import { auth } from "../firebase/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
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
      signInWithEmail: async () => {},
      signUpWithEmail: async () => {},
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
      console.log('🔐 Auth state changed:', user ? `User ${user.email} (${user.uid})` : 'No user');
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
      console.log("🔐 Starting Google sign-in process...");
      console.log("🔐 Current domain:", window.location.hostname);
      console.log("🔐 Firebase auth domain:", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
      
      const provider = new GoogleAuthProvider();
      console.log("🔐 Google provider created, attempting sign-in...");
      await signInWithPopup(auth, provider);
      console.log("🔐 Google sign-in successful!");
    } catch (error: any) {
      console.error("❌ Google sign-in error:", error);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/unauthorized-domain') {
        setError("This domain is not authorized for Firebase authentication. Please contact support.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError("Sign-in cancelled. Please try again.");
      } else if (error.code === 'auth/popup-blocked') {
        setError("Pop-up blocked. Please allow pop-ups for this site and try again.");
      } else {
        setError(`Sign-in failed: ${error.message}. Please try again.`);
      }
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) {
      console.log("🔧 Firebase not configured - demo sign in");
      setError("Firebase not configured. Please check your environment variables.");
      return;
    }

    try {
      setError(null);
      console.log("🔐 Starting email sign-in process...");
      await signInWithEmailAndPassword(auth, email, password);
      console.log("🔐 Email sign-in successful!");
    } catch (error: any) {
      console.error("❌ Email sign-in error:", error);
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/user-not-found') {
        setError("No account found with this email address.");
      } else if (error.code === 'auth/wrong-password') {
        setError("Incorrect password. Please try again.");
      } else if (error.code === 'auth/invalid-email') {
        setError("Invalid email address.");
      } else if (error.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(`Sign-in failed: ${error.message}`);
      }
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    if (!auth) {
      console.log("🔧 Firebase not configured - demo sign up");
      setError("Firebase not configured. Please check your environment variables.");
      return;
    }

    try {
      setError(null);
      console.log("🔐 Starting email sign-up process...");
      
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update display name
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: name
        });
      }
      
      console.log("🔐 Email sign-up successful!");
    } catch (error: any) {
      console.error("❌ Email sign-up error:", error);
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/email-already-in-use') {
        setError("An account with this email already exists.");
      } else if (error.code === 'auth/invalid-email') {
        setError("Invalid email address.");
      } else if (error.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(`Sign-up failed: ${error.message}`);
      }
      throw error;
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
    signInWithEmail,
    signUpWithEmail,
    signOut,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
