"use client";
import { usePathname } from "next/navigation";
import SplashScreen from "@/components/shared/SplashScreen";
import TabbedDocumentEditor from "./TabbedDocumentEditor";

const DocumentEditor: React.FC<React.PropsWithChildren> = () => {
  const pathname = usePathname();
  const id = pathname.split("/")[2]?.toLowerCase();

  if (!id) {
    return <SplashScreen title="Document Not Found" />;
  }

  return <TabbedDocumentEditor rootId={id} />;
};

export default DocumentEditor;
