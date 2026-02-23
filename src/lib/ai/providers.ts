import { createOllama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
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

  const baseURL = process.env.AZURE_OPENAI_BASE_URL;
  if (!baseURL) {
    throw new AIConfigurationError("AZURE_OPENAI_BASE_URL not configured");
  }
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ||
    "2025-04-01-preview";

  // Use @ai-sdk/openai with custom fetch to transform URLs for Azure format
  // This provides v2/v3 model specs while using standard chat completions API
  const openai = createOpenAI({
    apiKey,
    baseURL,
    headers: {
      "api-key": apiKey,
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;
        const urlObj = new URL(url);

        // Extract model from request body
        // Clone the body to avoid consuming the original stream
        let model: string | undefined;
        if (init?.body) {
          try {
            const bodyText = typeof init.body === "string"
              ? init.body
              : await new Response(init.body).text();
            const bodyData = JSON.parse(bodyText);
            model = bodyData.model;

            // Replace the consumed body with a new one
            init = {
              ...init,
              body: bodyText,
            };
          } catch (parseError) {
            console.error("Failed to parse request body:", parseError);
            throw new AIConfigurationError(
              "Failed to parse request body for Azure provider",
            );
          }
        }

        if (!model) {
          throw new AIConfigurationError(
            "Model ID is required for Azure provider",
          );
        }

        // Transform OpenAI URL to Azure format
        // From: {baseURL}/chat/completions or {baseURL}/v1/chat/completions
        // To: {baseURL}/openai/deployments/{model}/chat/completions?api-version={version}
        if (urlObj.pathname.endsWith("/chat/completions")) {
          urlObj.pathname = urlObj.pathname.replace(
            /\/(v1\/)?chat\/completions$/,
            `/openai/deployments/${model}/chat/completions`,
          );
          urlObj.searchParams.set("api-version", apiVersion);
        }

        return fetch(urlObj.toString(), init);
      } catch (error) {
        console.error("Azure provider fetch error:", error);
        throw error;
      }
    },
  });

  // Use .chat() to ensure we get chat models, not the prompt caching API
  return (modelId: string) => openai.chat(modelId);
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
