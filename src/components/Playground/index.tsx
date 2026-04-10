"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EditorSkeleton } from "../common/EditorSkeleton";
import SplashScreen from "../common/SplashScreen";

const Playground: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  const fallback = children
    ? <EditorSkeleton>{children}</EditorSkeleton>
    : <SplashScreen title="Loading Document" />;
  if (!isClient) return fallback;

  const PlaygroundEditor = dynamic(() => import("./PlaygroundEditor"), {
    ssr: false,
    loading: () => fallback,
  });
  return <PlaygroundEditor>{children}</PlaygroundEditor>;
};

export default Playground;
