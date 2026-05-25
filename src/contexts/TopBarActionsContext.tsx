"use client";
import React, { createContext, useCallback, useContext, useState } from "react";

interface TopBarActionsContextType {
  actions: React.ReactNode;
  setActions: (node: React.ReactNode) => void;
  clearActions: () => void;
}

const TopBarActionsContext = createContext<
  TopBarActionsContextType | undefined
>(
  undefined,
);

export const useTopBarActions = () => {
  const ctx = useContext(TopBarActionsContext);
  if (!ctx) {
    throw new Error(
      "useTopBarActions must be used within TopBarActionsProvider",
    );
  }
  return ctx;
};

export const TopBarActionsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [actions, setActionsState] = useState<React.ReactNode>(null);
  const setActions = useCallback(
    (node: React.ReactNode) => setActionsState(node),
    [],
  );
  const clearActions = useCallback(() => setActionsState(null), []);

  return (
    <TopBarActionsContext.Provider
      value={{ actions, setActions, clearActions }}
    >
      {children}
    </TopBarActionsContext.Provider>
  );
};
