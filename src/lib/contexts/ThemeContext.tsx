'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { saveUserTheme, getUserTheme } from '../firebase/userDataUtils';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  accent: string;
  background: string;
  cardBackground: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  bodyClass: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

// Two theme options - Light and Neon
const themes: Record<string, Theme> = {
  Light: {
    name: 'Light',
    colors: {
      primary: 'bg-gradient-to-r from-purple-500 to-pink-500',
      primaryHover: 'hover:from-purple-600 hover:to-pink-600',
      primaryLight: 'bg-purple-50',
      accent: 'text-purple-600',
      background: 'bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50',
      cardBackground: 'bg-white',
      textPrimary: 'text-gray-900',
      textSecondary: 'text-gray-600',
      border: 'border-gray-200',
      bodyClass: 'theme-light'
    }
  },
  Neon: {
    name: 'Neon',
    colors: {
      primary: 'bg-gradient-to-r from-emerald-500 to-cyan-500',
      primaryHover: 'hover:from-emerald-600 hover:to-cyan-600',
      primaryLight: 'bg-cyan-500/10',
      accent: 'text-cyan-400',
      background: 'bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900',
      cardBackground: 'bg-white/5',
      textPrimary: 'text-white',
      textSecondary: 'text-gray-300',
      border: 'border-cyan-500/30',
      bodyClass: 'theme-neon'
    }
  }
};

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeName: string) => void;
  themes: Record<string, Theme>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes.Neon);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Load user's theme preference from Firebase
  useEffect(() => {
    const loadUserTheme = async () => {
      if (user) {
        try {
          const savedTheme = await getUserTheme(user.uid);
          if (savedTheme && themes[savedTheme]) {
            setCurrentTheme(themes[savedTheme]);
            // Update body class to match theme
            if (typeof document !== 'undefined') {
              document.body.className = document.body.className.replace(/theme-\w+/g, '');
              document.body.classList.add(themes[savedTheme].colors.bodyClass);
            }
          }
        } catch (error) {
          console.error('Error loading user theme:', error);
        }
      }
      setIsLoading(false);
    };

    loadUserTheme();
  }, [user]);

  const setTheme = async (themeName: string) => {
    if (themes[themeName]) {
      setCurrentTheme(themes[themeName]);
      
      // Update body class to match theme
      if (typeof document !== 'undefined') {
        document.body.className = document.body.className.replace(/theme-\w+/g, '');
        document.body.classList.add(themes[themeName].colors.bodyClass);
      }

      // Save to Firebase if user is authenticated
      if (user) {
        try {
          await saveUserTheme(user.uid, themeName);
        } catch (error) {
          console.error('Error saving theme preference:', error);
        }
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}; 