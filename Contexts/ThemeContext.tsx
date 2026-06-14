import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { ThemeType } from '../types';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light-minimal', setTheme: async () => {} });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData, user } = useAuth();
  const [theme, setThemeState] = useState<ThemeType>('light-minimal');

  useEffect(() => {
    if (userData?.selectedTheme) {
      setThemeState(userData.selectedTheme as ThemeType);
      document.documentElement.setAttribute('data-theme', userData.selectedTheme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [userData]);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          selectedTheme: newTheme
        });
      } catch (error) {
        console.error("Error updating theme:", error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
