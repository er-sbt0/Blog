import { createAsyncThunk } from "@reduxjs/toolkit";
import { GetSeriesResponse, PostSeriesResponse } from "@/types";

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
      const response = await fetch("/api/series");
      const { data, error } = await response.json() as GetSeriesResponse;
      if (error) return thunkAPI.rejectWithValue(error);
      if (!data) return thunkAPI.fulfillWithValue([]);
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

export const createSeries = createAsyncThunk(
  "app/createSeries",
  async (payloadCreator: SeriesCreateInput, thunkAPI) => {
    try {
      const response = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadCreator),
      });
      const { data, error } = await response.json() as PostSeriesResponse;
      if (error) return thunkAPI.rejectWithValue(error);
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
      const response = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const { data: result, error } = await response
        .json() as PostSeriesResponse;
      if (error) return thunkAPI.rejectWithValue(error);
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
      const response = await fetch(`/api/series/${id}`, { method: "DELETE" });
      const { data, error } = await response.json() as {
        data?: string;
        error?: { title: string; subtitle?: string };
      };
      if (error) return thunkAPI.rejectWithValue(error);
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
