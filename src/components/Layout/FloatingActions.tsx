"use client";
import { FloatingActionsContainer } from "./FloatingActionsContainer";
import FooterWithFloatingAction from "../Home/FooterWithFloatingAction";
import { ReactNode } from "react";

export function FloatingActions() {
  return (
    <>
      <FooterWithFloatingAction />
      {/* Additional floating action buttons can be added here */}
    </>
  );
}

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  return (
    <FloatingActionsContainer>
      {children}
      <FloatingActions />
    </FloatingActionsContainer>
  );
}
