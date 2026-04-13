"use client";
import dynamic from "next/dynamic";
import useIsHydrated from "@/hooks/useIsHydrated";
import { EditorSkeleton } from "../shared/EditorSkeleton";
import SplashScreen from "../shared/SplashScreen";

const Tutorial: React.FC<React.PropsWithChildren> = ({ children }) => {
  const isClient = useIsHydrated();
  const fallback = children
    ? <EditorSkeleton>{children}</EditorSkeleton>
    : <SplashScreen title="Loading Document" />;
  if (!isClient) return fallback;

  const TutorialEditor = dynamic(() => import("./TutorialEditor"), {
    ssr: false,
    loading: () => fallback,
  });
  return <TutorialEditor>{children}</TutorialEditor>;
};

export default Tutorial;
