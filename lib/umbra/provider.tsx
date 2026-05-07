"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type UmbraContextValue = {
  ready: boolean;
};

const UmbraContext = createContext<UmbraContextValue | null>(null);

export function UmbraProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ ready: false }), []);

  return <UmbraContext.Provider value={value}>{children}</UmbraContext.Provider>;
}

export function useUmbra() {
  const context = useContext(UmbraContext);

  if (!context) {
    throw new Error("useUmbra must be used within UmbraProvider");
  }

  return context;
}
