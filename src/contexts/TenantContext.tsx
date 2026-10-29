import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firestore } from "../lib/firebaseClientDb";
import {
  TenantProfile,
  getCachedTenant,
  setCachedTenant,
  invalidateTenantCache
} from "../lib/tenantService";
import { useAuth } from "./AuthContext";

interface TenantContextValue {
  tenant: TenantProfile | null;
  loading: boolean;
  updateTenantCache: (tenantData: any) => TenantProfile;
  invalidateCurrentTenant: (tenantId?: string) => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: false,
  updateTenantCache: (d) => d,
  invalidateCurrentTenant: () => {}
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();

  // 1) Instant Stale-While-Revalidate Hydration (< 50ms) from Memory Map or localStorage
  const [tenant, setTenant] = useState<TenantProfile | null>(() => {
    try {
      const impersonateId = localStorage.getItem("gbfleet_impersonate");
      const activeTenantId = impersonateId || profile?.companyId;
      if (activeTenantId) {
        const { data } = getCachedTenant(activeTenantId);
        if (data) return data;
      }
      const legacyComp = localStorage.getItem("gbfleet_company");
      if (legacyComp) {
        const parsed = JSON.parse(legacyComp);
        if (parsed && parsed.id) {
          return setCachedTenant(parsed.id, parsed);
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => !tenant && !!profile);

  // 2) Safety Fallback Timeout (2500ms max) + Background O(1) Tenant Document Listener
  useEffect(() => {
    const activeTenantId = localStorage.getItem("gbfleet_impersonate") || profile?.companyId;
    if (!activeTenantId) {
      setLoading(false);
      return;
    }

    // Immediate hydration from 5-min TTL cache if available
    const cached = getCachedTenant(activeTenantId);
    if (cached.data) {
      setTenant(cached.data);
      setLoading(false);
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    let unsubTenant: (() => void) | null = null;
    try {
      const tenantDocRef = doc(firestore, "tenants", activeTenantId);
      unsubTenant = onSnapshot(
        tenantDocRef,
        (snap) => {
          if (snap.exists()) {
            const updated = setCachedTenant(activeTenantId, {
              id: activeTenantId,
              ...snap.data()
            });
            setTenant(updated);
          } else if (cached.data) {
            // Auto-heal O(1) tenant doc in background
            setDoc(tenantDocRef, cached.data, { merge: true }).catch(() => {});
          }
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    } catch (e) {
      setLoading(false);
    }

    return () => {
      clearTimeout(safetyTimer);
      if (unsubTenant) unsubTenant();
    };
  }, [profile?.companyId]);

  const updateTenantCache = useCallback((tenantData: any): TenantProfile => {
    if (!tenantData?.id) return tenantData;
    const sanitized = setCachedTenant(tenantData.id, tenantData);
    setTenant(sanitized);
    try {
      localStorage.setItem("gbfleet_company", JSON.stringify(sanitized));
    } catch (e) {}
    return sanitized;
  }, []);

  const invalidateCurrentTenant = useCallback((targetId?: string) => {
    const idToClear = targetId || tenant?.id || profile?.companyId;
    invalidateTenantCache(idToClear);
  }, [tenant?.id, profile?.companyId]);

  return (
    <TenantContext.Provider value={{ tenant, loading, updateTenantCache, invalidateCurrentTenant }}>
      {children}
    </TenantContext.Provider>
  );
};
