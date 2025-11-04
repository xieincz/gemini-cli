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
} from '@google/genai';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import type { Config } from '../config/config.js';
import {
  loadApiKey,
  loadOpenAICompatApiKey,
  loadOpenAICompatBaseUrl,
} from './apiKeyCredentialStorage.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  OPENAI_COMPAT = 'openai-compatible',
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
  baseUrl?: string;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey =
    (await loadApiKey()) || process.env['GEMINI_API_KEY'] || undefined;
  const googleApiKey = process.env['GOOGLE_API_KEY'] || undefined;
  const googleCloudProject =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
    undefined;
  const googleCloudLocation = process.env['GOOGLE_CLOUD_LOCATION'] || undefined;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.OPENAI_COMPAT) {
    const openaiApiKey =
      (await loadOpenAICompatApiKey()) ||
      process.env['OPENAI_API_KEY'] ||
      undefined;
    const openaiBaseUrl =
      (await loadOpenAICompatBaseUrl()) ||
      process.env['OPENAI_BASE_URL'] ||
      undefined;
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.baseUrl = openaiBaseUrl;
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponses) {
      return FakeContentGenerator.fromFile(gcConfig.fakeResponses);
    }
    const version = process.env['CLI_VERSION'] || process.version;
    const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
    const baseHeaders: Record<string, string> = {
      'User-Agent': userAgent,
    };
    if (
      config.authType === AuthType.LOGIN_WITH_GOOGLE ||
      config.authType === AuthType.CLOUD_SHELL
    ) {
      const httpOptions = { headers: baseHeaders };
      return new LoggingContentGenerator(
        await createCodeAssistContentGenerator(
          httpOptions,
          config.authType,
          gcConfig,
          sessionId,
        ),
        gcConfig,
      );
    }

    if (
      config.authType === AuthType.USE_GEMINI ||
      config.authType === AuthType.USE_VERTEX_AI
    ) {
      let headers: Record<string, string> = { ...baseHeaders };
      if (gcConfig?.getUsageStatisticsEnabled()) {
        const installationManager = new InstallationManager();
        const installationId = installationManager.getInstallationId();
        headers = {
          ...headers,
          'x-gemini-api-privileged-user-id': `${installationId}`,
        };
      }
      const httpOptions = { headers };

      const googleGenAI = new GoogleGenAI({
        apiKey: config.apiKey === '' ? undefined : config.apiKey,
        vertexai: config.vertexai,
        httpOptions,
      });
      return new LoggingContentGenerator(googleGenAI.models, gcConfig);
    }
    if (config.authType === AuthType.OPENAI_COMPAT) {
      const { toContents } = await import('../code_assist/converter.js');
      class OpenAICompatContentGenerator implements ContentGenerator {
        constructor(
          private readonly baseUrl?: string,
          private readonly apiKey?: string,
        ) {}
        private ensureConfig(): void {
          if (!this.baseUrl || !this.apiKey) {
            throw new Error('Missing OPENAI_BASE_URL or OPENAI_API_KEY');
          }
        }
        private toOpenAIMessages(
          contents: ReturnType<typeof toContents>,
          systemInstruction?: unknown,
        ): Array<{ role: string; content: string }> {
          const msgs: Array<{ role: string; content: string }> = [];
          if (systemInstruction) {
            const sys = Array.isArray(systemInstruction)
              ? systemInstruction
              : typeof systemInstruction === 'string'
                ? [{ text: systemInstruction }]
                : ((systemInstruction as { parts?: unknown[] }).parts ?? [
                    systemInstruction as { text?: string },
                  ]);
            const text = Array.isArray(sys)
              ? sys
                  .map((p) =>
                    typeof p === 'string'
                      ? p
                      : ((p as { text?: string }).text ?? ''),
                  )
                  .join('')
              : '';
            if (text) {
              msgs.push({ role: 'system', content: text });
            }
          }
          for (const c of contents) {
            const role = c.role === 'model' ? 'assistant' : 'user';
            const text = (c.parts ?? [])
              .map((p) =>
                typeof p === 'string'
                  ? p
                  : ((p as { text?: string }).text ?? ''),
              )
              .join('');
            msgs.push({ role, content: text });
          }
          return msgs;
        }
        private buildHeaders(): Record<string, string> {
          return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          };
        }
        private mapFinishReason(r?: string): FinishReason | undefined {
          if (!r) return undefined;
          switch (r) {
            case 'stop':
              return FinishReason.STOP;
            case 'length':
              return FinishReason.MAX_TOKENS;
            case 'content_filter':
              return FinishReason.SAFETY;
            default:
              return FinishReason.OTHER;
          }
        }
        async generateContent(
          request: GenerateContentParameters,
          _userPromptId: string,
        ): Promise<GenerateContentResponse> {
          this.ensureConfig();
          const messages = this.toOpenAIMessages(
            toContents(request.contents),
            request.config?.systemInstruction,
          );
          const body = {
            model: request.model,
            messages,
            temperature: request.config?.temperature,
          };
          const resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: request.config?.abortSignal,
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(txt || `HTTP ${resp.status}`);
          }
          const data = (await resp.json()) as {
            id?: string;
            model?: string;
            choices?: Array<{
              message?: { content?: string };
              finish_reason?: string;
            }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
            };
          };
          const out = new (
            await import('@google/genai')
          ).GenerateContentResponse();
          const text = data.choices?.[0]?.message?.content ?? '';
          out.candidates = [
            {
              content: {
                role: 'model',
                parts: text ? [{ text }] : [],
              },
              finishReason: this.mapFinishReason(
                data.choices?.[0]?.finish_reason,
              ),
            },
          ];
          out.modelVersion = data.model ?? request.model;
          out.responseId = data.id;
          if (data.usage) {
            out.usageMetadata = {
              promptTokenCount: data.usage.prompt_tokens,
              candidatesTokenCount: data.usage.completion_tokens,
              totalTokenCount: data.usage.total_tokens,
            };
          }
          return out;
        }
        async generateContentStream(
          request: GenerateContentParameters,
          _userPromptId: string,
        ): Promise<AsyncGenerator<GenerateContentResponse>> {
          this.ensureConfig();
          const messages = this.toOpenAIMessages(
            toContents(request.contents),
            request.config?.systemInstruction,
          );
          const body = {
            model: request.model,
            messages,
            temperature: request.config?.temperature,
            stream: true,
          };
          const resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: request.config?.abortSignal,
          });
          if (!resp.ok || !resp.body) {
            const txt = await resp.text();
            throw new Error(txt || `HTTP ${resp.status}`);
          }
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const mkChunk = async (payload: unknown) => {
            const obj = payload as {
              id?: string;
              model?: string;
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string;
              }>;
            };
            const out = new (
              await import('@google/genai')
            ).GenerateContentResponse();
            const text = obj.choices?.[0]?.delta?.content ?? '';
            out.candidates = [
              {
                content: {
                  role: 'model',
                  parts: text ? [{ text }] : [],
                },
                finishReason: this.mapFinishReason(
                  obj.choices?.[0]?.finish_reason,
                ),
              },
            ];
            out.modelVersion = obj.model ?? request.model;
            out.responseId = obj.id;
            return out;
          };
          async function* stream(): AsyncGenerator<GenerateContentResponse> {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const json = JSON.parse(data);
                  const chunk = await mkChunk(json);
                  yield chunk;
                } catch {
                  void 0;
                }
              }
            }
            if (buffer) {
              const trimmed = buffer.trim();
              if (trimmed.startsWith('data:')) {
                const data = trimmed.slice(5).trim();
                if (data !== '[DONE]') {
                  try {
                    const json = JSON.parse(data);
                    const chunk = await mkChunk(json);
                    yield chunk;
                  } catch {
                    void 0;
                  }
                }
              }
            }
          }
          return stream();
        }
        async countTokens(
          _request: CountTokensParameters,
        ): Promise<CountTokensResponse> {
          return { totalTokens: 0 } as CountTokensResponse;
        }
        async embedContent(
          request: EmbedContentParameters,
        ): Promise<EmbedContentResponse> {
          this.ensureConfig();
          const body = {
            model: request.model,
            input: request.contents,
          };
          const resp = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(txt || `HTTP ${resp.status}`);
          }
          const data = (await resp.json()) as {
            data: Array<{ embedding: number[] }>;
          };
          return {
            embeddings: data.data.map((d) => ({ values: d.embedding })),
          } as EmbedContentResponse;
        }
      }
      return new LoggingContentGenerator(
        new OpenAICompatContentGenerator(config.baseUrl, config.apiKey),
        gcConfig,
      );
    }
    throw new Error(
      `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
    );
  })();

  if (gcConfig.recordResponses) {
    return new RecordingContentGenerator(generator, gcConfig.recordResponses);
  }

  return generator;
}
