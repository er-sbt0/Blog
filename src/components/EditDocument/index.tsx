"use client";
import dynamic from "next/dynamic";
import { Component, ErrorInfo, ReactNode, Suspense, useEffect, useState } from "react";
import { EditorSkeleton } from "../EditorSkeleton";
import SplashScreen from "../SplashScreen";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class EditorErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Editor error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SplashScreen
          title="Editor Error"
          subtitle={`Something went wrong: ${
            this.state.error?.message || "Unknown error"
          }`}
        />
      );
    }

    return this.props.children;
  }
}

const DocumentEditor = dynamic(() => import("./Editor"), { ssr: false });

const EditDocument: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  const fallback = children
    ? <EditorSkeleton>{children}</EditorSkeleton>
    : <SplashScreen title="Loading Document" />;
  if (!isClient) return fallback;

  return (
    <EditorErrorBoundary>
      <Suspense fallback={fallback}>
        <DocumentEditor>{children}</DocumentEditor>
      </Suspense>
    </EditorErrorBoundary>
  );
};

export default EditDocument;
