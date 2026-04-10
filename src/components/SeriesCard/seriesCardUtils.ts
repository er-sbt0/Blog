"use client";
import { useRouter } from "next/navigation";
import { useDispatch } from "@/store";
import { deleteSeries } from "@/store/app";
import { useMenuState } from "@/hooks/useMenuState";
import { Series } from "@/types";
import { formatFullDate } from "@/utils/dateFormat";

export { formatFullDate as formatDate };

export function useSeriesActions(series: Series | null | undefined) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { anchorEl, menuOpen, openMenu, closeMenu } = useMenuState();

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e);
  };

  const handleEdit = () => {
    closeMenu();
    if (series) {
      router.push(`/series/${series.id}/edit`);
    }
  };

  const handleDelete = async () => {
    closeMenu();
    if (!series) return;
    if (!confirm("Delete this series? Posts will not be deleted.")) return;
    await dispatch(deleteSeries(series.id));
    router.refresh();
  };

  return {
    anchorEl,
    menuOpen,
    handleOpenMenu,
    handleCloseMenu: closeMenu,
    handleEdit,
    handleDelete,
  };
}
