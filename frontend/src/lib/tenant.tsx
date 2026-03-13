import React, { createContext, useContext } from "react";

export type MeResponse = {
  ok: boolean;
  user: { id: string; email: string | null };
  active: {
    client_id: string;
    role: string;
    client: { id: string; name: string };
  };
  memberships: Array<{
    client_id: string;
    role: string;
    client: { id: string; name: string } | null;
  }>;
};

export type TenantContextValue = {
  me: MeResponse | null;
  loadingMe: boolean;
  meError: string | null;

  activeClientId: string | null;
  activeRole: string | null;

  memberships: MeResponse["memberships"];

  switchTenant: (clientId: string) => void;
  refreshMe: () => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export const TenantProvider: React.FC<{
  value: TenantContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within <TenantProvider>");
  return ctx;
}
