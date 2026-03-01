export type AIProviderType = "google" | "anthropic" | "azure" | "ollama";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProviderType;
  capabilities: {
    streaming: boolean;
    maxTokens: number;
    supportsImages?: boolean;
  };
  metadata?: {
    fast?: boolean;
    reason?: boolean;
  };
}

export type AIOptionType =
  | "improve"
  | "continue"
  | "shorter"
  | "longer"
  | "zap"
  | "summarize"
  | "tone";

export interface AIProviderConfig {
  google: {
    apiKey?: string;
  };
  anthropic: {
    apiKey?: string;
  };
  azure: {
    apiKey?: string;
    resourceName?: string;
  };
  ollama: {
    baseURL?: string;
  };
}

export interface AICompletionRequest {
  prompt: string;
  option: AIOptionType;
  command?: string;
  tone?: string;
  provider: AIProviderType;
  model: string;
}
