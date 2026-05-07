"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useUmbraClient as useUmbraClientHook, type UmbraClientState } from "./client";

const Ctx = createContext<UmbraClientState | null>(null);

export function UmbraProvider({ children }: { children: ReactNode }) {
  const state = useUmbraClientHook();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useUmbraClient(): UmbraClientState {
  const v = useContext(Ctx);
  if (!v) return { status: "idle" };
  return v;
}
