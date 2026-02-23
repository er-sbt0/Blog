import { createAsyncThunk } from "@reduxjs/toolkit";
import { Alert, PatchUserResponse, User } from "@/types";
import NProgress from "nprogress";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const updateUser = createAsyncThunk(
  "app/updateUser",
  async (
    payloadCreator: { id: string; partial: Partial<User> },
    thunkAPI,
  ) => {
    try {
      NProgress.start();
      const { id, partial } = payloadCreator;
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const { data, error } = await response.json() as PatchUserResponse;
      if (error) return thunkAPI.rejectWithValue(error);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update user",
        });
      }
      const payload: User = data;
      return thunkAPI.fulfillWithValue(payload);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const alert = createAsyncThunk(
  "app/alert",
  async (payloadCreator: Alert, thunkAPI) => {
    try {
      const id = await new Promise((resolve) => {
        const handler = (event: MouseEvent): void => {
          const target = event.target as HTMLElement;
          const button = target.closest("button");
          const paper = target.closest(".MuiDialog-paper");
          if (paper && !button) {
            return document.addEventListener("click", handler, { once: true });
          }
          resolve(button?.id ?? null);
        };
        setTimeout(() => {
          document.addEventListener("click", handler, { once: true });
        }, 0);
      });
      return thunkAPI.fulfillWithValue(id);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
