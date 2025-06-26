'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

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
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

// Three theme options
const themes: Record<string, Theme> = {
  Light: {
    name: 'Light',
    colors: {
      primary: 'bg-blue-600',
      primaryHover: 'hover:bg-blue-700',
      primaryLight: 'bg-blue-50',
      accent: 'text-blue-600',
      background: 'bg-gray-50',
      cardBackground: 'bg-white',
      textPrimary: 'text-gray-900',
      textSecondary: 'text-gray-600',
      border: 'border-gray-200'
    }
  },
  Dark: {
    name: 'Dark',
    colors: {
      primary: 'bg-blue-600',
      primaryHover: 'hover:bg-blue-700',
      primaryLight: 'bg-blue-900/20',
      accent: 'text-blue-400',
      background: 'bg-gray-900',
      cardBackground: 'bg-gray-800',
      textPrimary: 'text-white',
      textSecondary: 'text-gray-300',
      border: 'border-gray-700'
    }
  },
  Premium: {
    name: 'Premium',
    colors: {
      primary: 'bg-gradient-to-r from-amber-500 via-red-500 to-purple-600',
      primaryHover: 'hover:from-amber-600 hover:via-red-600 hover:to-purple-700',
      primaryLight: 'bg-slate-800/50',
      accent: 'text-amber-400',
      background: 'bg-slate-900',
      cardBackground: 'bg-gradient-to-br from-slate-800/90 to-slate-900/90',
      textPrimary: 'text-white',
      textSecondary: 'text-slate-300',
      border: 'border-slate-700/50'
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
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes.Light);

  const setTheme = (themeName: string) => {
    if (themes[themeName]) {
      setCurrentTheme(themes[themeName]);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}; 