import { streamText } from "ai";
import { match } from "ts-pattern";
import {
  AIModelNotFoundError,
  type AIOptionType,
  type AIProviderType,
  createProvider,
  getModelById,
  getSystemPrompt,
} from "@/lib/ai";

export const runtime = "edge";

export async function POST(req: Request) {
  let provider: string | undefined;
  let modelId: string | undefined;

  try {
    const body = await req.json();
    provider = body.provider;
    modelId = body.model;
    const { prompt, option, command } = body;

    const systemPrompt = getSystemPrompt(option as AIOptionType);

    const messages = match(option)
      .with("continue", () => [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: prompt,
        },
      ])
      .with("improve", () => [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: prompt,
        },
      ])
      .with("shorter", () => [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: prompt,
        },
      ])
      .with("longer", () => [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: prompt,
        },
      ])
      .with("zap", () => [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: `${command}${prompt ? `\n${prompt}` : ""}`,
        },
      ])
      .run();

    if (!modelId) {
      throw new Error("Model ID is required");
    }

    const model = getModelById(modelId);
    if (!model) {
      throw new AIModelNotFoundError(modelId);
    }

    const providerInstance = createProvider(provider as AIProviderType);
    const modelInstance = providerInstance(model.id);

    const result = streamText({
      model: modelInstance,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("AI Completion error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error details:", {
      errorMessage,
      errorStack,
      provider,
      modelId,
    });
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorStack,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
