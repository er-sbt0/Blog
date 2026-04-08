"use client";
import { useRouter } from "next/navigation";
import { useDispatch } from "@/store";
import { deleteSeries } from "@/store/app";
import { useMenuState } from "@/hooks/useMenuState";
import { Series } from "@/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

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
