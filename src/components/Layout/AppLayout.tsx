import StoreProvider from "@/store/StoreProvider";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import AppLayoutContent from "./AppLayoutContent";
import { Suspense } from "react";
import { SidebarWidthProvider } from "@/contexts/SidebarWidthContext";
import { LayoutModeProvider } from "@/contexts/LayoutModeContext";
import { TopBarActionsProvider } from "@/contexts/TopBarActionsContext";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Suspense>
        <ProgressBar />
      </Suspense>
      <StoreProvider>
        <SidebarWidthProvider>
          <LayoutModeProvider>
            <TopBarActionsProvider>
              <AppLayoutContent>{children}</AppLayoutContent>
              <AlertDialog />
              <Announcer />
            </TopBarActionsProvider>
          </LayoutModeProvider>
        </SidebarWidthProvider>
      </StoreProvider>
    </>
  );
};

export default AppLayout;
