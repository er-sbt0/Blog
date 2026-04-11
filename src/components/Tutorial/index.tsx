"use client";
import { useEffect, useState } from "react";
import { EditorSkeleton } from "../shared/EditorSkeleton";
import SplashScreen from "../shared/SplashScreen";
import dynamic from "next/dynamic";

const Tutorial: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
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
