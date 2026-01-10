import type { AIModel, AIProviderType } from './types';

export const AI_MODELS: AIModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    capabilities: {
      streaming: true,
      maxTokens: 8192,
    },
    metadata: {
      fast: true,
      reason: false,
    },
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    capabilities: {
      streaming: true,
      maxTokens: 8192,
    },
    metadata: {
      fast: false,
      reason: false,
    },
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    capabilities: {
      streaming: true,
      maxTokens: 8192,
    },
    metadata: {
      fast: false,
      reason: true,
    },
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    capabilities: {
      streaming: true,
      maxTokens: 8192,
    },
    metadata: {
      fast: false,
      reason: true,
    },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT 4o Mini',
    provider: 'azure',
    capabilities: {
      streaming: true,
      maxTokens: 8192,
    },
    metadata: {
      fast: true,
      reason: false,
    },
  },
  {
    id: 'phi4',
    name: 'Phi 4',
    provider: 'ollama',
    capabilities: {
      streaming: true,
      maxTokens: 4096,
    },
    metadata: {
      fast: false,
      reason: false,
    },
  },
];

export const getModelById = (id: string): AIModel | undefined => 
  AI_MODELS.find(m => m.id === id);

export const getModelsByProvider = (provider: AIProviderType): AIModel[] =>
  AI_MODELS.filter(m => m.provider === provider);

export const getDefaultModel = (): AIModel => 
  AI_MODELS[0]; // gemini-2.5-flash
