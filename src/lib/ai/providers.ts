import { createOllama } from "ollama-ai-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AIModel, AIProviderType } from "./types";
import { AIConfigurationError, AIProviderError } from "./errors";

/**
 * Use a flexible type that works with all provider versions.
 * Different providers return different model specification versions (v1, v2, v3),
 * and there's no common base type that all providers implement.
 * This is a known limitation of the AI SDK's provider architecture.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProviderInstance = (modelId: string) => any;

const createGoogleProvider = (): ProviderInstance => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new AIConfigurationError(
      "GOOGLE_GENERATIVE_AI_API_KEY not configured",
    );
  }
  return createGoogleGenerativeAI({ apiKey });
};

const createAnthropicProvider = (): ProviderInstance => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIConfigurationError("ANTHROPIC_API_KEY not configured");
  }
  return createAnthropic({ apiKey });
};

const createAzureProvider = (): ProviderInstance => {
  const apiKey = process.env.AZURE_API_KEY;
  if (!apiKey) {
    throw new AIConfigurationError("AZURE_API_KEY not configured");
  }
  return createOpenAICompatible({
    name: "azure-openai",
    baseURL: "https://models.inference.ai.azure.com/",
    apiKey,
  });
};

const createOllamaProvider = (): ProviderInstance => {
  const baseURL = process.env.OLLAMA_API_URL || "http://localhost:11434/api";
  return createOllama({ baseURL });
};

export const createProvider = (
  providerType: AIProviderType,
): ProviderInstance => {
  try {
    switch (providerType) {
      case "google":
        return createGoogleProvider();
      case "anthropic":
        return createAnthropicProvider();
      case "azure":
        return createAzureProvider();
      case "ollama":
        return createOllamaProvider();
      default:
        throw new AIProviderError(
          providerType,
          `Unknown provider type: ${providerType}`,
        );
    }
  } catch (error) {
    if (
      error instanceof AIConfigurationError || error instanceof AIProviderError
    ) {
      throw error;
    }
    throw new AIProviderError(
      providerType,
      "Failed to create provider",
      error,
    );
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getModelInstance = (model: AIModel): any => {
  const provider = createProvider(model.provider);
  return provider(model.id);
};
