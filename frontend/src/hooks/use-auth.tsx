"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getCurrentUser, loginUser, registerUser } from "@/lib/api";
import type { User } from "@/lib/types";

const TOKEN_KEY = "letscore_access_token";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = readStoredToken();
    setToken(storedToken);

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    getCurrentUser(storedToken)
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const persistToken = useCallback((nextToken: string, nextUser: User) => {
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginUser({ email, password });
      persistToken(result.access_token, result.user);
    },
    [persistToken],
  );

  const register = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const result = await registerUser({ email, password, full_name: fullName });
      persistToken(result.access_token, result.user);
    },
    [persistToken],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, login, register, logout }),
    [isLoading, login, logout, register, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

export function useRequireAuth() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.token) {
      router.replace("/login");
    }
  }, [auth.isLoading, auth.token, router]);

  return auth;
}
