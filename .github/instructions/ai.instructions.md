---
applyTo: 'src/**/*ai*,src/**/*completion*,src/**/*llm*'
---

# AI Integration Architecture Guidelines

## Current State (January 2026)

### SDK Versions (Pinned)
- `ai`: 6.0.27
- `@ai-sdk/react`: 3.0.29
- `@ai-sdk/google`: 3.0.6
- `@ai-sdk/anthropic`: 3.0.9 ✓ v3 model support with AI SDK v6

### Active Providers
| Provider | Models | Use Case |
|----------|--------|----------|
| Google | gemini-2.5-flash, gemini-2.5-pro | Default, fast completions |
| Anthropic | claude-3-5-sonnet-20241022, claude-sonnet-4-20250514 | Complex reasoning |
| Azure OpenAI | gpt-4o-mini | Enterprise fallback |
| Ollama | phi4 | Local/offline |

### Key Files
- `src/app/api/completion/route.ts` - API endpoint
- `src/editor/plugins/ToolbarPlugin/Dialogs/AIDialog.tsx` - Model selection UI
- `src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx` - Toolbar actions

---

## Target Architecture

### Directory Structure
```
src/lib/ai/
├── index.ts           # Public API exports
├── types.ts           # AIProvider, AIModel, AIOption interfaces
├── models.ts          # Single source of truth for model definitions
├── prompts.ts         # Centralized prompt templates
├── providers.ts       # Provider factory functions
└── errors.ts          # Custom error classes
```

### Design Principles

1. **Single Source of Truth**
   - Model definitions in ONE file (`models.ts`)
   - Prompt templates in ONE file (`prompts.ts`)
   - No duplicate model lists across components

2. **Type Safety**
   - Eliminate `as any` type assertions
   - Use discriminated unions for providers
   - Strict typing for model capabilities

3. **Provider Abstraction**
   - Factory pattern for provider instantiation
   - Consistent interface across all providers
   - Environment-based configuration

4. **Error Handling**
   - Custom error classes for AI failures
   - Graceful degradation when providers unavailable
   - User-friendly error messages

---

## Implementation Steps

### Phase 1: Create Abstraction Layer

```typescript
// src/lib/ai/types.ts
export type AIProviderType = 'google' | 'anthropic' | 'azure' | 'ollama';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProviderType;
  capabilities: {
    streaming: boolean;
    maxTokens: number;
    supportsImages?: boolean;
  };
}

export interface AIOption {
  value: string;
  label: string;
  prompt: string;
}
```

```typescript
// src/lib/ai/models.ts
import type { AIModel } from './types';

export const AI_MODELS: AIModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    capabilities: { streaming: true, maxTokens: 8192 }
  },
  // ... other models
];

export const getModelById = (id: string) => 
  AI_MODELS.find(m => m.id === id);

export const getModelsByProvider = (provider: AIProviderType) =>
  AI_MODELS.filter(m => m.provider === provider);
```

```typescript
// src/lib/ai/prompts.ts
export const PROMPTS = {
  rewrite: 'Rewrite the following text to improve clarity and flow:',
  continue: 'Continue writing from where the text ends:',
  shorter: 'Make this text more concise while keeping key information:',
  longer: 'Expand this text with more detail and examples:',
  fixSpelling: 'Fix any spelling and grammar errors:',
  changeTone: (tone: string) => `Rewrite in a ${tone} tone:`,
} as const;
```

### Phase 2: Refactor API Route

```typescript
// src/app/api/completion/route.ts
import { createProvider, getModelInstance } from '@/lib/ai/providers';
import { PROMPTS } from '@/lib/ai/prompts';
import { AICompletionError } from '@/lib/ai/errors';

export async function POST(req: Request) {
  const { prompt, model: modelId, option } = await req.json();
  
  const model = getModelById(modelId);
  if (!model) throw new AICompletionError('Invalid model');
  
  const provider = createProvider(model.provider);
  const systemPrompt = PROMPTS[option] ?? PROMPTS.rewrite;
  
  // ... rest of implementation
}
```

### Phase 3: Update UI Components

- Import models from `@/lib/ai/models`
- Import prompts from `@/lib/ai/prompts`
- Remove hardcoded model arrays from components

---

## Migration Checklist

- [ ] Create `src/lib/ai/` directory structure
- [ ] Implement `types.ts` with interfaces
- [ ] Implement `models.ts` with model definitions
- [ ] Implement `prompts.ts` with prompt templates
- [ ] Implement `providers.ts` with factory functions
- [ ] Implement `errors.ts` with custom errors
- [ ] Create `index.ts` with public exports
- [ ] Refactor `route.ts` to use abstraction
- [ ] Refactor `AIDialog.tsx` to import from lib
- [ ] Refactor `AITools.tsx` to use centralized prompts
- [ ] Remove `as any` type assertions
- [ ] Add unit tests for provider factory
- [ ] Update package.json with exact versions (no ^)
- [ ] Remove debug console.log statements
- [ ] Document environment variables in README

---

## Environment Variables

```bash
# Required for Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY=

# Required for Anthropic Claude
ANTHROPIC_API_KEY=

# Optional: Azure OpenAI
AZURE_API_KEY=
AZURE_RESOURCE_NAME=

# Optional: Local Ollama
OLLAMA_API_URL=http://localhost:11434/api
```

---

## Known Issues & Workarounds

### SDK Version Compatibility
The AI SDK has frequent breaking changes between major versions:
- v4 → v5: Model interface changes
- v5 → v6: Support for model specification v3, React hooks architecture updates

**Current Setup (AI SDK v6)**:
- AI SDK v6 supports model specifications v1, v2, and v3
- `@ai-sdk/anthropic` v3.x uses specification v3 (compatible with SDK v6)
- Enables access to latest Claude models (Claude Sonnet 4)

**Migration Notes**:
- Upgraded from AI SDK v5 to v6 on January 10, 2026
- No breaking changes detected in core API usage
- All existing code continues to work

**Mitigation**: Pin exact versions in package.json, test before upgrading.

### Type Assertions
Current code uses `model as any` due to interface mismatches between provider SDKs.

**Mitigation**: After refactoring, use discriminated unions and proper type guards.

### Model Availability
Models may be deprecated or renamed (e.g., gemini-2.0 → gemini-2.5).

**Mitigation**: Centralize model definitions, monitor provider changelogs.

---

## Testing Checklist

When modifying AI integration:

1. [ ] Test with Google Gemini (default provider)
2. [ ] Test with Anthropic Claude (reasoning tasks)
3. [ ] Test each AI option (rewrite, continue, shorter, longer, etc.)
4. [ ] Verify streaming works in UI
5. [ ] Test error handling (invalid API key, rate limits)
6. [ ] Check console for unexpected errors
7. [ ] Verify build passes without type errors
