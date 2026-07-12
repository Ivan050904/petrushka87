"use client";



import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useRef,

  useState,

} from "react";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";



import { getCurrentUser, loginUser, setUnauthorizedHandler } from "@/lib/api";

import {

  AUTH_TOKEN_KEY,

  clearAuthCookie,

  hasAuthCookie,

  setAuthCookie,

} from "@/lib/auth-cookie";

import type { User } from "@/lib/types";



const TOKEN_KEY = AUTH_TOKEN_KEY;

export { AUTH_COOKIE } from "@/lib/auth-cookie";



type AuthContextValue = {

  token: string | null;

  user: User | null;

  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;

  logout: () => void;

};



const AuthContext = createContext<AuthContextValue | null>(null);



function readStoredToken() {

  if (typeof window === "undefined") {

    return null;

  }

  return window.localStorage.getItem(TOKEN_KEY);

}



export function hasStoredAuthSession() {

  return Boolean(readStoredToken()) || hasAuthCookie();

}



function clearAuthSession(setToken: (value: string | null) => void, setUser: (value: User | null) => void) {

  window.localStorage.removeItem(TOKEN_KEY);

  clearAuthCookie();

  setToken(null);

  setUser(null);

}



export function AuthProvider({ children }: { children: ReactNode }) {

  const [token, setToken] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const sessionEpochRef = useRef(0);



  const validateStoredToken = useCallback((storedToken: string) => {

    const epoch = ++sessionEpochRef.current;

    setIsLoading(true);



    const timeoutId = window.setTimeout(() => {
      if (sessionEpochRef.current !== epoch) {
        return;
      }
      setIsLoading(false);
    }, 12_000);

    getCurrentUser(storedToken)

      .then((currentUser) => {

        if (sessionEpochRef.current !== epoch) {

          return;

        }

        setUser(currentUser);

      })

      .catch(() => {

        if (sessionEpochRef.current !== epoch) {

          return;

        }

        if (readStoredToken() !== storedToken) {

          return;

        }

        clearAuthSession(setToken, setUser);

      })

      .finally(() => {

        window.clearTimeout(timeoutId);

        if (sessionEpochRef.current !== epoch) {

          return;

        }

        setIsLoading(false);

      });

  }, []);



  useEffect(() => {

    setUnauthorizedHandler(() => {

      const tokenAtError = readStoredToken();

      queueMicrotask(() => {

        if (readStoredToken() !== tokenAtError) {

          return;

        }

        sessionEpochRef.current += 1;

        clearAuthSession(setToken, setUser);

        setIsLoading(false);

      });

    });

    return () => setUnauthorizedHandler(null);

  }, []);



  useEffect(() => {

    const storedToken = readStoredToken();

    if (!storedToken) {

      clearAuthCookie();

      setIsLoading(false);

      return;

    }



    setToken(storedToken);

    setAuthCookie();

    validateStoredToken(storedToken);

  }, [validateStoredToken]);



  const persistToken = useCallback((nextToken: string, nextUser: User) => {

    sessionEpochRef.current += 1;

    window.localStorage.setItem(TOKEN_KEY, nextToken);

    setAuthCookie();

    setToken(nextToken);

    setUser(nextUser);

    setIsLoading(false);

  }, []);



  const login = useCallback(

    async (email: string, password: string) => {

      const result = await loginUser({ email, password });

      persistToken(result.access_token, result.user);

    },

    [persistToken],

  );



  const logout = useCallback(() => {

    sessionEpochRef.current += 1;

    clearAuthSession(setToken, setUser);

    setIsLoading(false);

  }, []);



  const value = useMemo(

    () => ({ token, user, isLoading, login, logout }),

    [isLoading, login, logout, token, user],

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

    if (auth.isLoading) {

      return;

    }

    if (auth.token || hasStoredAuthSession()) {

      return;

    }

    const next =

      typeof window !== "undefined"

        ? `${window.location.pathname}${window.location.search}`

        : "/dashboard";

    router.replace(`/login?next=${encodeURIComponent(next)}`);

  }, [auth.isLoading, auth.token, router]);



  return auth;

}



export function completeAuthRedirect(target = "/dashboard") {

  setAuthCookie();

  window.location.assign(target);

}



