/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { checkExhaustive } from '../../utils/checks.js';

interface OpenAIAuthDialogProps {
  onSubmit: (params: {
    baseUrl: string;
    apiKey: string;
    modelPro?: string;
    modelFlash?: string;
    modelFlashLite?: string;
    modelEmbedding?: string;
  }) => void;
  onCancel: () => void;
  error?: string | null;
  defaultBaseUrl?: string;
  defaultApiKey?: string;
  defaultModelPro?: string;
  defaultModelFlash?: string;
  defaultModelFlashLite?: string;
  defaultModelEmbedding?: string;
}

export function OpenAIAuthDialog({
  onSubmit,
  onCancel,
  error,
  defaultBaseUrl = '',
  defaultApiKey = '',
  defaultModelPro = '',
  defaultModelFlash = '',
  defaultModelFlashLite = '',
  defaultModelEmbedding = '',
}: OpenAIAuthDialogProps): React.JSX.Element {
  const { mainAreaWidth } = useUIState();
  const viewportWidth = mainAreaWidth - 8;

  const baseUrlBuffer = useTextBuffer({
    initialText: defaultBaseUrl || '',
    initialCursorOffset: defaultBaseUrl?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const apiKeyBuffer = useTextBuffer({
    initialText: defaultApiKey || '',
    initialCursorOffset: defaultApiKey?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const proModelBuffer = useTextBuffer({
    initialText: defaultModelPro || '',
    initialCursorOffset: defaultModelPro?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const flashModelBuffer = useTextBuffer({
    initialText: defaultModelFlash || '',
    initialCursorOffset: defaultModelFlash?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const flashLiteModelBuffer = useTextBuffer({
    initialText: defaultModelFlashLite || '',
    initialCursorOffset: defaultModelFlashLite?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const embeddingModelBuffer = useTextBuffer({
    initialText: defaultModelEmbedding || '',
    initialCursorOffset: defaultModelEmbedding?.length || 0,
    viewport: { width: viewportWidth, height: 4 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const [focused, setFocused] = React.useState<
    | 'baseUrl'
    | 'apiKey'
    | 'modelPro'
    | 'modelFlash'
    | 'modelFlashLite'
    | 'modelEmbedding'
  >('baseUrl');

  const submit = () => {
    onSubmit({
      baseUrl: baseUrlBuffer.text.trim(),
      apiKey: apiKeyBuffer.text.trim(),
      modelPro: proModelBuffer.text.trim(),
      modelFlash: flashModelBuffer.text.trim(),
      modelFlashLite: flashLiteModelBuffer.text.trim(),
      modelEmbedding: embeddingModelBuffer.text.trim(),
    });
  };

  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setFocused((prev) => {
          switch (prev) {
            case 'baseUrl':
              return 'apiKey';
            case 'apiKey':
              return 'modelPro';
            case 'modelPro':
              return 'modelFlash';
            case 'modelFlash':
              return 'modelFlashLite';
            case 'modelFlashLite':
              return 'modelEmbedding';
            case 'modelEmbedding':
              return 'baseUrl';
            default:
              checkExhaustive(prev);
          }
        });
        return;
      }
      if (key.name === 'return') {
        submit();
      }
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        Configure OpenAI-format API
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Enter the Base URL and API key for an OpenAI-compatible API.
        </Text>
        <Text color={theme.text.secondary}>
          Values can also be read from environment variables or .gemini
          settings.
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>Base URL</Text>
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
        >
          <TextInput
            buffer={baseUrlBuffer}
            onSubmit={submit}
            onCancel={onCancel}
            placeholder="e.g. https://api.openai.com"
            focus={focused === 'baseUrl'}
          />
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>API Key</Text>
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
        >
          <TextInput
            buffer={apiKeyBuffer}
            onSubmit={submit}
            onCancel={onCancel}
            placeholder="Paste your API key here"
            focus={focused === 'apiKey'}
          />
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>Model Overrides (optional)</Text>
        <Text color={theme.text.secondary}>
          Map Gemini models to OpenAI models: Pro, Flash, Flash Lite, Embedding.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>Pro</Text>
          <Box
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
          >
            <TextInput
              buffer={proModelBuffer}
              onSubmit={submit}
              onCancel={onCancel}
              placeholder="e.g. gpt-4o"
              focus={focused === 'modelPro'}
            />
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>Flash</Text>
          <Box
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
          >
            <TextInput
              buffer={flashModelBuffer}
              onSubmit={submit}
              onCancel={onCancel}
              placeholder="e.g. gpt-4o-mini"
              focus={focused === 'modelFlash'}
            />
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>Flash Lite</Text>
          <Box
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
          >
            <TextInput
              buffer={flashLiteModelBuffer}
              onSubmit={submit}
              onCancel={onCancel}
              placeholder="Model name"
              focus={focused === 'modelFlashLite'}
            />
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>Embedding</Text>
          <Box
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
          >
            <TextInput
              buffer={embeddingModelBuffer}
              onSubmit={submit}
              onCancel={onCancel}
              placeholder="e.g. text-embedding-3-large"
              focus={focused === 'modelEmbedding'}
            />
          </Box>
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Tab to switch, Enter to submit, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
