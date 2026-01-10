import { CoreMessage, streamText } from "ai";
import { createOllama } from "ollama-ai-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { match } from "ts-pattern";

export const runtime = "edge";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ollama = createOllama({ baseURL: process.env.OLLAMA_API_URL });

const azure = createOpenAICompatible({
  name: "azure-openai",
  baseURL: "https://models.inference.ai.azure.com/",
  apiKey: process.env.AZURE_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt, option, command, ...body } = await req.json();

    const messages = match(option)
      .with("continue", () => [
        {
          role: "system",
          content:
            "You are an AI writing assistant for the text editor application 'Editor'. " +
            "You are asked to continue writing more text following user's " +
            "Use Markdown for text formatting when appropriate. " +
            "Write any math formulas in Latex surrounded by $ delimiters. " +
            "Respond directly without any conversation starters.",
        },
        {
          role: "user",
          content: prompt,
        },
      ])
      .with("improve", () => [
        {
          role: "system",
          content:
            "You are an AI writing assistant for the text editor application 'Editor'. " +
            "You are asked to rewrite what user writes in another way. " +
            "Use Markdown for text formatting when appropriate. " +
            "Write any math formulas in Latex surrounded by $ delimiters. " +
            "Respond directly without any conversation starters.",
        },
        {
          role: "user",
          content: prompt,
        },
      ])
      .with("shorter", () => [
        {
          role: "system",
          content:
            "You are an AI writing assistant for the text editor application 'Editor'. " +
            "You are asked to rewrite what user writes in a shorter form. " +
            "Use Markdown for text formatting when appropriate. " +
            "Write any math formulas in Latex surrounded by $ delimiters. " +
            "Respond directly without any conversation starters.",
        },
        {
          role: "user",
          content: prompt,
        },
      ])
      .with("longer", () => [
        {
          role: "system",
          content:
            "You are an AI writing assistant for the text editor application 'Editor'. " +
            "You are asked to rewrite what user writes in a longer form. " +
            "Use Markdown for text formatting when appropriate. " +
            "Write any math formulas in Latex surrounded by $ delimiters. " +
            "Respond directly without any conversation starters.",
        },
        {
          role: "user",
          content: prompt,
        },
      ])
      .with("zap", () => [
        {
          role: "system",
          content:
            "You are an AI writing assistant for the text editor application 'Editor'. " +
            "You are asked to help the user with his document. " +
            "Use Markdown for text formatting when appropriate. " +
            "Write any math formulas in Latex surrounded by $ delimiters. " +
            "Respond directly without any conversation starters.",
        },
        {
          role: "user",
          content: `${command}${prompt ? `\n${prompt}` : ""}`,
        },
      ])
      .run() as CoreMessage[];

    const model = match(body.provider)
      .with("ollama", () => ollama(body.model || "llama3.2"))
      .with("google", () => google(body.model || "gemini-2.5-flash"))
      .with(
        "anthropic",
      () => anthropic(body.model || "claude-3-5-sonnet-20241022"),
      .with("ollama", () => undefined)
      .with("google", () => undefined)
      .with("anthropic", () => 8192)
    .with("azure", () => undefined)
    .run();

  const result = streamText({ 
    model: model as any, 
    messages
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
