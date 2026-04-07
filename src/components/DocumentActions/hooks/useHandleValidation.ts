"use client";
import { useCallback, useState } from "react";
import { debounce } from "@mui/material/utils";
import { validate } from "uuid";
import { CheckHandleResponse } from "@/types";

export function useHandleValidation(
  currentHandle: string | null,
  onHandleChange: (value: string) => void,
) {
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const hasErrors = Object.keys(validationErrors).length > 0;

  const resetValidation = () => {
    setValidating(false);
    setValidationErrors({});
  };

  const checkHandle = useCallback(
    debounce(async (handle: string) => {
      try {
        const response = await fetch(`/api/documents/check?handle=${handle}`);
        const { error } = (await response.json()) as CheckHandleResponse;
        if (error) {
          setValidationErrors({ handle: `${error.title}: ${error.subtitle}` });
        } else {
          setValidationErrors({});
        }
      } catch {
        setValidationErrors({
          handle: "Something went wrong: Please try again later",
        });
      }
      setValidating(false);
    }, 500),
    [],
  );

  const updateHandle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim().toLowerCase().replace(
      /[^A-Za-z0-9]/g,
      "-",
    );
    onHandleChange(value);
    if (!value || value === currentHandle) return setValidationErrors({});
    if (value.length < 3) {
      return setValidationErrors({
        handle:
          "Handle is too short: Handle must be at least 3 characters long",
      });
    }
    if (!/^[a-zA-Z0-9-]+$/.test(value)) {
      return setValidationErrors({
        handle:
          "Invalid Handle: Handle must only contain letters, numbers, and hyphens",
      });
    }
    if (validate(value)) {
      return setValidationErrors({
        handle: "Invalid Handle: Handle must not be a UUID",
      });
    }
    setValidating(true);
    checkHandle(value);
  };

  return { validating, validationErrors, hasErrors, updateHandle, resetValidation };
}
