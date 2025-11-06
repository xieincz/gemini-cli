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

interface OpenAIAuthDialogProps {
  onSubmit: (params: { baseUrl: string; apiKey: string }) => void;
  onCancel: () => void;
  error?: string | null;
  defaultBaseUrl?: string;
  defaultApiKey?: string;
}

export function OpenAIAuthDialog({
  onSubmit,
  onCancel,
  error,
  defaultBaseUrl = '',
  defaultApiKey = '',
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

  const [focused, setFocused] = React.useState<'baseUrl' | 'apiKey'>('baseUrl');

  const submit = () => {
    onSubmit({ baseUrl: baseUrlBuffer.text.trim(), apiKey: apiKeyBuffer.text.trim() });
  };

  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setFocused((prev) => (prev === 'baseUrl' ? 'apiKey' : 'baseUrl'));
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
    <Box borderStyle="round" borderColor={theme.border.focused} flexDirection="column" padding={1} width="100%">
      <Text bold color={theme.text.primary}>Configure OpenAI-format API</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>Enter the Base URL and API key for an OpenAI-compatible API.</Text>
        <Text color={theme.text.secondary}>Values can also be read from environment variables or .gemini settings.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>Base URL</Text>
        <Box borderStyle="round" borderColor={theme.border.default} paddingX={1}>
          <TextInput buffer={baseUrlBuffer} onSubmit={submit} onCancel={onCancel} placeholder="e.g. https://api.openai.com" focus={focused === 'baseUrl'} />
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>API Key</Text>
        <Box borderStyle="round" borderColor={theme.border.default} paddingX={1}>
          <TextInput buffer={apiKeyBuffer} onSubmit={submit} onCancel={onCancel} placeholder="Paste your API key here" focus={focused === 'apiKey'} />
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>(Tab to switch, Enter to submit, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}
