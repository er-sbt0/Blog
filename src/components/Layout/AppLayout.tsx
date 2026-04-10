import StoreProvider from "@/store/StoreProvider";
import DocumentInfoDrawerArrow from "./DocumentInfoDrawerArrow";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import AppLayoutContent from "./AppLayoutContent";
import { Suspense } from "react";
import { SidebarWidthProvider } from "./SideBar/SidebarWidthContext";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Suspense>
        <ProgressBar />
      </Suspense>
      <StoreProvider>
        <SidebarWidthProvider>
          <AppLayoutContent>{children}</AppLayoutContent>
          <AlertDialog />
          <Announcer />
          <DocumentInfoDrawerArrow />
        </SidebarWidthProvider>
      </StoreProvider>
    </>
  );
};

export default AppLayout;
