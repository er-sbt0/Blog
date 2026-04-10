import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/api";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

interface SeriesCreateInput {
  title: string;
  description?: string;
}

export const loadSeries = createAsyncThunk(
  "app/loadSeries",
  async (_, thunkAPI) => {
    try {
      const data = await apiClient.series.list();
      return thunkAPI.fulfillWithValue(data ?? []);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createSeries = createAsyncThunk(
  "app/createSeries",
  async (payloadCreator: SeriesCreateInput, thunkAPI) => {
    try {
      const data = await apiClient.series.create(payloadCreator);
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateSeries = createAsyncThunk(
  "app/updateSeries",
  async (
    { id, data }: {
      id: string;
      data: { title?: string; description?: string };
    },
    thunkAPI,
  ) => {
    try {
      const result = await apiClient.series.update(id, data);
      return thunkAPI.fulfillWithValue(result);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteSeries = createAsyncThunk(
  "app/deleteSeries",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.series.delete(id);
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
