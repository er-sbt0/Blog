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
  try {
    const { prompt, option, command, provider, model: modelId } = await req
      .json();

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
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
