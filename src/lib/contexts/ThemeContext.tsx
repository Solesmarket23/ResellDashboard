'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  accent: string;
  background: string;
  cardBackground: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  dotColor: string;
}

const themes: Record<string, Theme> = {
  Energetic: {
    name: 'Energetic',
    colors: {
      primary: 'bg-red-600',
      primaryHover: 'hover:bg-red-700',
      primaryLight: 'bg-red-50',
      accent: 'text-red-600',
      background: 'bg-white',
      cardBackground: 'bg-red-100'
    },
    dotColor: 'bg-red-500'
  },
  Calm: {
    name: 'Calm',
    colors: {
      primary: 'bg-blue-400',
      primaryHover: 'hover:bg-blue-500',
      primaryLight: 'bg-blue-50',
      accent: 'text-blue-400',
      background: 'bg-white',
      cardBackground: 'bg-blue-100'
    },
    dotColor: 'bg-blue-300'
  },
  Focus: {
    name: 'Focus',
    colors: {
      primary: 'bg-purple-600',
      primaryHover: 'hover:bg-purple-700',
      primaryLight: 'bg-purple-50',
      accent: 'text-purple-600',
      background: 'bg-white',
      cardBackground: 'bg-purple-200'
    },
    dotColor: 'bg-purple-400'
  },
  Success: {
    name: 'Success',
    colors: {
      primary: 'bg-green-600',
      primaryHover: 'hover:bg-green-700',
      primaryLight: 'bg-green-50',
      accent: 'text-green-600',
      background: 'bg-white',
      cardBackground: 'bg-green-100'
    },
    dotColor: 'bg-green-600'
  },
  Warning: {
    name: 'Warning',
    colors: {
      primary: 'bg-yellow-600',
      primaryHover: 'hover:bg-yellow-700',
      primaryLight: 'bg-yellow-50',
      accent: 'text-yellow-600',
      background: 'bg-white',
      cardBackground: 'bg-yellow-100'
    },
    dotColor: 'bg-yellow-500'
  },
  Creative: {
    name: 'Creative',
    colors: {
      primary: 'bg-pink-600',
      primaryHover: 'hover:bg-pink-700',
      primaryLight: 'bg-pink-50',
      accent: 'text-pink-600',
      background: 'bg-white',
      cardBackground: 'bg-pink-100'
    },
    dotColor: 'bg-pink-400'
  },
  Professional: {
    name: 'Professional',
    colors: {
      primary: 'bg-blue-600',
      primaryHover: 'hover:bg-blue-700',
      primaryLight: 'bg-blue-50',
      accent: 'text-blue-600',
      background: 'bg-white',
      cardBackground: 'bg-white'
    },
    dotColor: 'bg-blue-600'
  },
  Cozy: {
    name: 'Cozy',
    colors: {
      primary: 'bg-orange-600',
      primaryHover: 'hover:bg-orange-700',
      primaryLight: 'bg-orange-50',
      accent: 'text-orange-600',
      background: 'bg-white',
      cardBackground: 'bg-orange-100'
    },
    dotColor: 'bg-orange-500'
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
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes.Professional);

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