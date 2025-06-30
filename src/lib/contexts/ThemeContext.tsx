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
  bodyClass: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

// Three theme options that match exactly with Plans page designs
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
  Dark: {
    name: 'Dark',
    colors: {
      primary: 'bg-gradient-to-r from-purple-500 to-pink-500',
      primaryHover: 'hover:from-purple-600 hover:to-pink-600',
      primaryLight: 'bg-slate-800/50',
      accent: 'text-blue-400',
      background: 'bg-slate-950',
      cardBackground: 'bg-slate-900/80',
      textPrimary: 'text-white',
      textSecondary: 'text-slate-300',
      border: 'border-slate-700/50',
      bodyClass: 'theme-dark'
    }
  },
  Premium: {
    name: 'Premium',
    colors: {
      primary: 'bg-gradient-to-r from-cyan-500 to-purple-500',
      primaryHover: 'hover:from-cyan-600 hover:to-purple-600',
      primaryLight: 'bg-white/5',
      accent: 'text-cyan-400',
      background: 'bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900',
      cardBackground: 'bg-white/5',
      textPrimary: 'text-white',
      textSecondary: 'text-white/80',
      border: 'border-white/20',
      bodyClass: 'theme-revolutionary'
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
      // Update body class to match theme
      if (typeof document !== 'undefined') {
        document.body.className = document.body.className.replace(/theme-\w+/g, '');
        document.body.classList.add(themes[themeName].colors.bodyClass);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}; 