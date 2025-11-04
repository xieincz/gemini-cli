/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import {
  AuthType,
  loadOpenAICompatBaseUrl,
  loadOpenAICompatApiKey,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import type { Key } from '../hooks/useKeypress.js';

interface ApiAuthDialogProps {
  onSubmit: (apiKey: string, baseUrl?: string) => void;
  onCancel: () => void;
  error?: string | null;
  defaultValue?: string;
}

export function ApiAuthDialog({
  onSubmit,
  onCancel,
  error,
  defaultValue = '',
}: ApiAuthDialogProps): React.JSX.Element {
  const { mainAreaWidth } = useUIState();
  const viewportWidth = mainAreaWidth - 8;
  const settings = useSettings();
  const selectedType = settings.merged.security?.auth?.selectedType;

  const apiKeyBuffer = useTextBuffer({
    initialText: defaultValue || '',
    initialCursorOffset: defaultValue?.length || 0,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false, // No path validation needed for API key
    inputFilter: (text) =>
      text.replace(/[^a-zA-Z0-9_-]/g, '').replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const baseUrlDefaultEnv = process.env['OPENAI_BASE_URL'] ?? '';
  const baseUrlBuffer = useTextBuffer({
    initialText: baseUrlDefaultEnv,
    initialCursorOffset: baseUrlDefaultEnv.length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (hydrated) return;
      if (selectedType !== AuthType.OPENAI_COMPAT) return;
      const storedBaseUrl = (await loadOpenAICompatBaseUrl()) ?? '';
      if (!cancelled && storedBaseUrl) {
        baseUrlBuffer.setText(storedBaseUrl);
      }
      const storedKey = (await loadOpenAICompatApiKey()) ?? '';
      if (!cancelled && storedKey && !defaultValue) {
        apiKeyBuffer.setText(storedKey);
      }
      if (!cancelled) setHydrated(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedType, hydrated, defaultValue, apiKeyBuffer, baseUrlBuffer]);

  useEffect(() => {
    if (selectedType === AuthType.OPENAI_COMPAT) {
      setFocusedField('baseUrl');
    }
  }, [selectedType]);

  const [focusedField, setFocusedField] = useState<
    | 'baseUrl'
    | 'proModel'
    | 'flashModel'
    | 'flashLiteModel'
    | 'embeddingModel'
    | 'apiKey'
  >(selectedType === AuthType.OPENAI_COMPAT ? 'baseUrl' : 'apiKey');

  const overrides = settings.merged.model?.openaiCompatOverrides || {};
  const proDefault = (overrides as { pro?: string }).pro ?? '';
  const flashDefault = (overrides as { flash?: string }).flash ?? '';
  const flashLiteDefault =
    (overrides as { flashLite?: string }).flashLite ?? '';
  const embeddingDefault =
    (overrides as { embedding?: string }).embedding ?? '';

  const proBuffer = useTextBuffer({
    initialText: proDefault,
    initialCursorOffset: proDefault.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/\r?\n/g, ''),
    singleLine: true,
  });
  const flashBuffer = useTextBuffer({
    initialText: flashDefault,
    initialCursorOffset: flashDefault.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/\r?\n/g, ''),
    singleLine: true,
  });
  const flashLiteBuffer = useTextBuffer({
    initialText: flashLiteDefault,
    initialCursorOffset: flashLiteDefault.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/\r?\n/g, ''),
    singleLine: true,
  });
  const embeddingBuffer = useTextBuffer({
    initialText: embeddingDefault,
    initialCursorOffset: embeddingDefault.length,
    viewport: { width: viewportWidth, height: 3 },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/\r?\n/g, ''),
    singleLine: true,
  });

  const handleTabPress = useCallback(
    (key: Key) => {
      if (selectedType !== AuthType.OPENAI_COMPAT) return;
      if (key.name !== 'tab') return;
      const order: Array<
        | 'baseUrl'
        | 'proModel'
        | 'flashModel'
        | 'flashLiteModel'
        | 'embeddingModel'
        | 'apiKey'
      > = [
        'baseUrl',
        'proModel',
        'flashModel',
        'flashLiteModel',
        'embeddingModel',
        'apiKey',
      ];
      const idx = order.indexOf(focusedField);
      const next = key.shift
        ? (idx - 1 + order.length) % order.length
        : (idx + 1) % order.length;
      setFocusedField(order[next]);
    },
    [selectedType, focusedField],
  );

  useKeypress(handleTabPress, { isActive: true });

  const handleBaseUrlMetaInsert = useCallback(
    (key: Key) => {
      if (
        selectedType === AuthType.OPENAI_COMPAT &&
        focusedField === 'baseUrl' &&
        key.meta &&
        !key.ctrl &&
        !key.paste &&
        key.name === '' &&
        key.sequence
      ) {
        baseUrlBuffer.insert(key.sequence);
      }
    },
    [selectedType, focusedField, baseUrlBuffer],
  );

  useKeypress(handleBaseUrlMetaInsert, { isActive: true });

  const handleSubmit = useCallback(() => {
    const apiKey = apiKeyBuffer.text;
    const baseUrl =
      selectedType === AuthType.OPENAI_COMPAT ? baseUrlBuffer.text : undefined;
    if (selectedType === AuthType.OPENAI_COMPAT) {
      const newOverrides: {
        pro?: string;
        flash?: string;
        flashLite?: string;
        embedding?: string;
      } = {};
      const p = proBuffer.text.trim();
      const f = flashBuffer.text.trim();
      const fl = flashLiteBuffer.text.trim();
      const e = embeddingBuffer.text.trim();
      if (p) newOverrides.pro = p;
      if (f) newOverrides.flash = f;
      if (fl) newOverrides.flashLite = fl;
      if (e) newOverrides.embedding = e;
      settings.setValue(
        SettingScope.User,
        'model.openaiCompatOverrides',
        newOverrides,
      );
    }
    onSubmit(apiKey, baseUrl);
  }, [
    apiKeyBuffer.text,
    baseUrlBuffer.text,
    selectedType,
    onSubmit,
    proBuffer.text,
    flashBuffer.text,
    flashLiteBuffer.text,
    embeddingBuffer.text,
    settings,
  ]);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        {selectedType === AuthType.OPENAI_COMPAT
          ? '输入 OpenAI 兼容 API 配置'
          : 'Enter Gemini API Key'}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {selectedType === AuthType.OPENAI_COMPAT ? (
          <>
            <Text color={theme.text.primary}>
              请输入 OpenAI 格式的 Base URL 与 API Key。
            </Text>
            <Text color={theme.text.secondary}>
              例如 Base URL：
              <Text color={theme.text.link}>https://api.openai.com/v1</Text>
            </Text>
          </>
        ) : (
          <>
            <Text color={theme.text.primary}>
              Please enter your Gemini API key. It will be securely stored in
              your system keychain.
            </Text>
            <Text color={theme.text.secondary}>
              You can get an API key from{' '}
              <Text color={theme.text.link}>
                https://aistudio.google.com/app/apikey
              </Text>
            </Text>
          </>
        )}
      </Box>
      {selectedType === AuthType.OPENAI_COMPAT && (
        <Box marginTop={1} flexDirection="row">
          <Box
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
            flexGrow={1}
          >
            <TextInput
              buffer={baseUrlBuffer}
              onSubmit={() => setFocusedField('proModel')}
              onCancel={onCancel}
              placeholder="输入 Base URL，例如 https://api.openai.com/v1"
              focus={focusedField === 'baseUrl'}
            />
          </Box>
        </Box>
      )}
      {selectedType === AuthType.OPENAI_COMPAT && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>模型替代（可选）</Text>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              flexGrow={1}
            >
              <Text color={theme.text.secondary}>替代 gemini-2.5-pro</Text>
              <TextInput
                buffer={proBuffer}
                onSubmit={() => setFocusedField('flashModel')}
                onCancel={onCancel}
                placeholder="例如 gpt-4o"
                focus={focusedField === 'proModel'}
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              flexGrow={1}
            >
              <Text color={theme.text.secondary}>替代 gemini-2.5-flash</Text>
              <TextInput
                buffer={flashBuffer}
                onSubmit={() => setFocusedField('flashLiteModel')}
                onCancel={onCancel}
                placeholder="例如 gpt-4o-mini"
                focus={focusedField === 'flashModel'}
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              flexGrow={1}
            >
              <Text color={theme.text.secondary}>
                替代 gemini-2.5-flash-lite
              </Text>
              <TextInput
                buffer={flashLiteBuffer}
                onSubmit={() => setFocusedField('embeddingModel')}
                onCancel={onCancel}
                placeholder="例如 gpt-4o-mini-lite"
                focus={focusedField === 'flashLiteModel'}
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              flexGrow={1}
            >
              <Text color={theme.text.secondary}>
                替代 gemini-embedding-001
              </Text>
              <TextInput
                buffer={embeddingBuffer}
                onSubmit={() => setFocusedField('apiKey')}
                onCancel={onCancel}
                placeholder="例如 text-embedding-3-large"
                focus={focusedField === 'embeddingModel'}
              />
            </Box>
          </Box>
        </Box>
      )}
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={apiKeyBuffer}
            onSubmit={handleSubmit}
            onCancel={onCancel}
            placeholder={
              selectedType === AuthType.OPENAI_COMPAT
                ? '输入 OpenAI API Key'
                : 'Paste your API key here'
            }
            focus={focusedField === 'apiKey'}
          />
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to submit, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
