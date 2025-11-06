/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';

type OpenAIMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function toText(parts: Part[] | undefined): string {
  if (!parts || parts.length === 0) return '';
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('');
}

function toOpenAIMessages(contents: Content[], system?: string): OpenAIMessage[] {
  const msgs: OpenAIMessage[] = [];
  if (system && system.trim()) {
    msgs.push({ role: 'system', content: system });
  }
  for (const c of contents) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    msgs.push({ role, content: toText(c.parts) });
  }
  return msgs;
}

export class OpenAIContentGenerator implements ContentGenerator {
  constructor(private readonly cfg: { baseUrl: string; apiKey: string }) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const body = {
      model: request.model,
      messages: toOpenAIMessages(request.contents as Content[], (request.config as any)?.systemInstruction as string | undefined),
      temperature: (request.config as any)?.temperature ?? 0,
      top_p: (request.config as any)?.topP ?? 1,
      stream: false,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const response: GenerateContentResponse = {
      candidates: [
        {
          content: { role: 'model', parts: text ? [{ text }] : [] },
        },
      ],
      modelVersion: request.model,
      responseId: data?.id,
      usageMetadata: data?.usage && {
        promptTokenCount: data.usage.prompt_tokens,
        candidatesTokenCount: data.usage.completion_tokens,
        totalTokenCount: data.usage.total_tokens,
      },
    } as GenerateContentResponse;
    return response;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resp = await this.generateContent(request, userPromptId);
    async function* once() {
      yield resp;
    }
    return once();
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const contents = req.contents as Content[];
    const text = contents.map((c) => toText(c.parts)).join('\n');
    const count = Math.ceil(text.length / 4);
    return { totalTokens: count } as CountTokensResponse;
  }

  async embedContent(req: EmbedContentParameters): Promise<EmbedContentResponse> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/v1/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        input: req.contents,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI Embeddings error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const vectors = (data?.data || []).map((e: any) => e.embedding || e.vector || []);
    return { embeddings: vectors.map((v: number[]) => ({ values: v })) } as EmbedContentResponse;
  }
}
