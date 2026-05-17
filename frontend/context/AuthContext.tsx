'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase'; // Ensure correct relative path

interface AuthContextType {
  user: User | null;
  googleToken: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for changes to the user's login state
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [isSigningIn, setIsSigningIn] = useState(false);

  const loginWithGoogle = async () => {
    if (isSigningIn) return; // FIX: Lock popup triggers to avoid duplicate requests and assertion errors
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      // THIS IS THE GOLDMINE: The credential holds the user's Google Calendar token!
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        console.log("Google OAuth Token Extracted!", credential.accessToken);
      }
    } catch (error: any) {
      // FIX: Gracefully handle benign user-cancelled or browser-blocked popup errors
      if (
        error.code === 'auth/cancelled-popup-request' ||
        error.code === 'auth/popup-blocked' ||
        error.code === 'auth/popup-closed-by-user'
      ) {
        console.warn("Sign-in popup cancelled or blocked by browser/user.", error.code);
      } else {
        console.error("Login failed:", error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, googleToken, loginWithGoogle, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
