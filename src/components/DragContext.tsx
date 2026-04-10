"use client";
import React, { createContext, ReactNode, useState } from "react";

interface DragContextType {
  isDragging: boolean;
  setIsDragging: (isDragging: boolean) => void;
}

// Create the context with a default value
export const DragContext = createContext<DragContextType>({
  isDragging: false,
  setIsDragging: () => {},
});

interface DragProviderProps {
  children: ReactNode;
}

export const DragProvider: React.FC<DragProviderProps> = ({ children }) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <DragContext.Provider value={{ isDragging, setIsDragging }}>
      {children}
    </DragContext.Provider>
  );
};
