import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { firestore } from "../lib/firebaseClientDb";
import {
  CachedUserProfile,
  getCachedUserProfile,
  setCachedUserProfile,
  clearCachedUserProfile,
  setCachedTenant,
  invalidateTenantCache
} from "../lib/tenantService";

interface AuthContextValue {
  profile: CachedUserProfile | null;
  loading: boolean;
  isSaaSAdmin: boolean;
  loginInstant: (user: any, company: any, sessionToken?: string) => void;
  logout: () => void;
  refreshAuthMeBackground: (userObj?: any) => void;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  loading: false,
  isSaaSAdmin: false,
  loginInstant: () => {},
  logout: () => {},
  refreshAuthMeBackground: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1) Instant Stale-While-Revalidate Hydration (< 50ms) from localStorage
  const [profile, setProfile] = useState<CachedUserProfile | null>(() => {
    try {
      const legacyStr = localStorage.getItem("gbfleet_user");
      if (legacyStr) {
        const parsed = JSON.parse(legacyStr);
        const uid = parsed?.id || parsed?.uid;
        if (uid) {
          const cached = getCachedUserProfile(uid);
          if (cached) return cached;
          return setCachedUserProfile(uid, parsed);
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  // If we already hydrated from localStorage cache, loading starts as FALSE immediately (< 50ms)!
  const [loading, setLoading] = useState<boolean>(() => !profile);
  const [isSaaSAdmin, setIsSaaSAdmin] = useState<boolean>(() => {
    return profile?.role === "superadmin" || profile?.role === "saas_admin";
  });

  // Non-blocking background verification against /api/auth/me and O(1) doc(db, 'usuarios', uid)
  const refreshAuthMeBackground = useCallback((userObj?: any) => {
    const target = userObj || profile;
    if (!target?.id) return;

    // Run asynchronously in background without blocking UI rendering
    Promise.resolve().then(async () => {
      try {
        // A) O(1) direct document read from 'usuarios/{uid}' (30ms, zero collection scan)
        const userDocRef = doc(firestore, "usuarios", String(target.id));
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.ativo !== false) {
            const merged = setCachedUserProfile(String(target.id), {
              ...target,
              ...data,
              id: String(target.id)
            });
            setProfile(merged);
            setIsSaaSAdmin(merged.role === "superadmin" || merged.role === "saas_admin");
          }
        } else {
          // Auto-heal O(1) user document in background so direct doc(db, 'usuarios', uid) is always populated
          const sanitized = setCachedUserProfile(String(target.id), target);
          setDoc(userDocRef, {
            uid: sanitized.id,
            id: sanitized.id,
            nome: sanitized.nome,
            email: sanitized.email,
            role: sanitized.role,
            tipo: sanitized.role,
            tenantId: sanitized.companyId,
            companyId: sanitized.companyId,
            ativo: true,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        }
      } catch (e) {
        // silent background fallback
      }

      try {
        // B) Server-authorized superadmin verification (/api/auth/me)
        const token = target.sessionToken || localStorage.getItem("gbfleet_session_token") || "";
        const res = await fetch("/api/auth/me", {
          headers: {
            "x-user-id": String(target.id),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (res.ok) {
          const meData = await res.json();
          if (meData && typeof meData.isSaaSAdmin === "boolean") {
            setIsSaaSAdmin(meData.isSaaSAdmin);
          }
        }
      } catch (e) {
        // silent background fallback
      }
    });
  }, [profile]);

  // 2) Safety Fallback Timeout (2500ms max) + Firebase Auth & O(1) onSnapshot listener
  useEffect(() => {
    // If on the Login screen (no profile in localStorage), immediately mark loading = false (<10ms)
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    let unsubDoc: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;

    try {
      const auth = getAuth();
      unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const cached = getCachedUserProfile(firebaseUser.uid);
          if (cached) {
            setProfile(cached);
            setIsSaaSAdmin(cached.role === "superadmin" || cached.role === "saas_admin");
            setLoading(false);
          }

          const userDocRef = doc(firestore, "usuarios", firebaseUser.uid);
          unsubDoc = onSnapshot(
            userDocRef,
            (snap) => {
              if (snap.exists()) {
                const updated = setCachedUserProfile(firebaseUser.uid, {
                  id: firebaseUser.uid,
                  ...snap.data()
                });
                setProfile(updated);
                setIsSaaSAdmin(updated.role === "superadmin" || updated.role === "saas_admin");
              }
              setLoading(false);
            },
            () => {
              setLoading(false);
            }
          );
        } else {
          setLoading(false);
        }
      });
    } catch (e) {
      setLoading(false);
    }

    // Trigger non-blocking background verification
    setLoading(false);
    refreshAuthMeBackground(profile);

    return () => {
      clearTimeout(safetyTimer);
      if (unsubDoc) unsubDoc();
      if (unsubAuth) unsubAuth();
    };
  }, [profile?.id]);

  const loginInstant = useCallback((user: any, company: any, sessionToken?: string) => {
    const uid = String(user?.id || user?.uid || "");
    const token = sessionToken || user?.sessionToken || "";
    if (token) {
      try {
        localStorage.setItem("gbfleet_session_token", token);
      } catch (e) {}
    }

    const cachedProf = setCachedUserProfile(uid, { ...user, sessionToken: token });
    try {
      localStorage.setItem("gbfleet_user", JSON.stringify({ ...user, sessionToken: token }));
    } catch (e) {}

    if (company && company.id) {
      const sanitizedComp = setCachedTenant(company.id, company);
      try {
        localStorage.setItem("gbfleet_company", JSON.stringify(sanitizedComp));
      } catch (e) {}
    }

    setProfile(cachedProf);
    setIsSaaSAdmin(cachedProf.role === "superadmin" || cachedProf.role === "saas_admin");
    setLoading(false);

    // Run secondary checks in background without blocking login transition
    refreshAuthMeBackground({ ...user, sessionToken: token });
  }, [refreshAuthMeBackground]);

  const logout = useCallback(() => {
    if (profile?.id) {
      clearCachedUserProfile(profile.id);
    }
    if (profile?.companyId) {
      invalidateTenantCache(profile.companyId);
    }
    try {
      localStorage.removeItem("gbfleet_user");
      localStorage.removeItem("gbfleet_company");
      localStorage.removeItem("gbfleet_impersonate");
      localStorage.removeItem("gbfleet_session_token");
    } catch (e) {}
    setProfile(null);
    setIsSaaSAdmin(false);
    setLoading(false);
  }, [profile]);

  return (
    <AuthContext.Provider value={{ profile, loading, isSaaSAdmin, loginInstant, logout, refreshAuthMeBackground }}>
      {children}
    </AuthContext.Provider>
  );
};
