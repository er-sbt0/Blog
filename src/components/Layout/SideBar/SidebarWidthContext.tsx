"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

interface SidebarWidthContextType {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}

const SidebarWidthContext = createContext<SidebarWidthContextType | undefined>(
  undefined,
);

export const useSidebarWidth = () => {
  const context = useContext(SidebarWidthContext);
  if (!context) {
    throw new Error(
      "useSidebarWidth must be used within SidebarWidthProvider",
    );
  }
  return context;
};

export const SidebarWidthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(72); // Default collapsed width

  return (
    <SidebarWidthContext.Provider value={{ sidebarWidth, setSidebarWidth }}>
      {children}
    </SidebarWidthContext.Provider>
  );
};
