/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  type Config,
  loadApiKey,
  debugLogger,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';

export function validateAuthMethodWithSettings(
  authType: AuthType,
  settings: LoadedSettings,
): string | null {
  const enforcedType = settings.merged.security?.auth?.enforcedType;
  if (enforcedType && enforcedType !== authType) {
    return `Authentication is enforced to be ${enforcedType}, but you are currently using ${authType}.`;
  }
  if (settings.merged.security?.auth?.useExternal) {
    return null;
  }
  // If using Gemini API key, we don't validate it here as we might need to prompt for it.
  if (
    authType === AuthType.USE_GEMINI ||
    authType === AuthType.USE_OPENAI_FORMAT
  ) {
    return null;
  }
  return validateAuthMethod(authType);
}

export const useAuthCommand = (settings: LoadedSettings, config: Config) => {
  const [authState, setAuthState] = useState<AuthState>(
    AuthState.Unauthenticated,
  );

  const [authError, setAuthError] = useState<string | null>(null);
  const [apiKeyDefaultValue, setApiKeyDefaultValue] = useState<
    string | undefined
  >(undefined);
  const [openaiDefaultBaseUrl, setOpenaiDefaultBaseUrl] = useState<
    string | undefined
  >(undefined);
  const [openaiDefaultApiKey, setOpenaiDefaultApiKey] = useState<
    string | undefined
  >(undefined);
  const [openaiDefaultModelPro, setOpenaiDefaultModelPro] = useState<
    string | undefined
  >(undefined);
  const [openaiDefaultModelFlash, setOpenaiDefaultModelFlash] = useState<
    string | undefined
  >(undefined);
  const [openaiDefaultModelFlashLite, setOpenaiDefaultModelFlashLite] =
    useState<string | undefined>(undefined);
  const [openaiDefaultModelEmbedding, setOpenaiDefaultModelEmbedding] =
    useState<string | undefined>(undefined);

  const onAuthError = useCallback(
    (error: string | null) => {
      setAuthError(error);
      if (error) {
        setAuthState(AuthState.Updating);
      }
    },
    [setAuthError, setAuthState],
  );

  const reloadApiKey = useCallback(async () => {
    const storedKey = (await loadApiKey()) ?? '';
    const envKey = process.env['GEMINI_API_KEY'] ?? '';
    const key = storedKey || envKey;
    setApiKeyDefaultValue(key);
    return key; // Return the key for immediate use
  }, []);

  const reloadOpenAIParams = useCallback(async () => {
    const envBaseUrl = process.env['OPENAI_BASE_URL'] ?? '';
    const envApiKey = process.env['OPENAI_API_KEY'] ?? '';
    const envModelPro = process.env['OPENAI_MODEL_PRO'] ?? '';
    const envModelFlash = process.env['OPENAI_MODEL_FLASH'] ?? '';
    const envModelFlashLite = process.env['OPENAI_MODEL_FLASH_LITE'] ?? '';
    const envModelEmbedding = process.env['OPENAI_MODEL_EMBEDDING'] ?? '';
    const settingsBaseUrl = settings.merged.security?.auth?.openai?.baseUrl;
    const settingsApiKey = settings.merged.security?.auth?.openai?.apiKey;
    const settingsOverrides =
      settings.merged.security?.auth?.openai?.modelOverrides;
    const baseUrl = (settingsBaseUrl as string | undefined) || envBaseUrl;
    const apiKey = (settingsApiKey as string | undefined) || envApiKey;
    const modelPro =
      (settingsOverrides?.pro as string | undefined) || envModelPro;
    const modelFlash =
      (settingsOverrides?.flash as string | undefined) || envModelFlash;
    const modelFlashLite =
      (settingsOverrides?.flashLite as string | undefined) || envModelFlashLite;
    const modelEmbedding =
      (settingsOverrides?.embedding as string | undefined) || envModelEmbedding;
    setOpenaiDefaultBaseUrl(baseUrl || '');
    setOpenaiDefaultApiKey(apiKey || '');
    setOpenaiDefaultModelPro(modelPro || '');
    setOpenaiDefaultModelFlash(modelFlash || '');
    setOpenaiDefaultModelFlashLite(modelFlashLite || '');
    setOpenaiDefaultModelEmbedding(modelEmbedding || '');
    return {
      baseUrl,
      apiKey,
      modelPro,
      modelFlash,
      modelFlashLite,
      modelEmbedding,
    };
  }, [settings.merged.security?.auth]);

  useEffect(() => {
    (async () => {
      if (authState !== AuthState.Unauthenticated) {
        return;
      }

      const authType = settings.merged.security?.auth?.selectedType;
      if (!authType) {
        if (process.env['GEMINI_API_KEY']) {
          onAuthError(
            'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.',
          );
        } else {
          onAuthError('No authentication method selected.');
        }
        return;
      }

      if (authType === AuthType.USE_GEMINI) {
        const key = await reloadApiKey(); // Use the unified function
        if (!key) {
          setAuthState(AuthState.AwaitingApiKeyInput);
          return;
        }
      }

      if (authType === AuthType.USE_OPENAI_FORMAT) {
        const {
          baseUrl,
          apiKey,
          modelPro,
          modelFlash,
          modelFlashLite,
          modelEmbedding,
        } = await reloadOpenAIParams();
        if (!baseUrl || !apiKey) {
          setAuthState(AuthState.AwaitingOpenAIInput);
          return;
        }
        // 同步 Settings 到环境变量，避免首次启动缺失 env 导致核心层读取失败
        process.env['OPENAI_BASE_URL'] = baseUrl;
        process.env['OPENAI_API_KEY'] = apiKey;
        if (modelPro) process.env['OPENAI_MODEL_PRO'] = modelPro;
        if (modelFlash) process.env['OPENAI_MODEL_FLASH'] = modelFlash;
        if (modelFlashLite)
          process.env['OPENAI_MODEL_FLASH_LITE'] = modelFlashLite;
        if (modelEmbedding)
          process.env['OPENAI_MODEL_EMBEDDING'] = modelEmbedding;
      }

      const error = validateAuthMethodWithSettings(authType, settings);
      if (error) {
        onAuthError(error);
        return;
      }

      const defaultAuthType = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
      if (
        defaultAuthType &&
        !Object.values(AuthType).includes(defaultAuthType as AuthType)
      ) {
        onAuthError(
          `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${defaultAuthType}". ` +
            `Valid values are: ${Object.values(AuthType).join(', ')}.`,
        );
        return;
      }

      try {
        await config.refreshAuth(authType);

        debugLogger.log(`Authenticated via "${authType}".`);
        setAuthError(null);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      }
    })();
  }, [
    settings,
    config,
    authState,
    setAuthState,
    setAuthError,
    onAuthError,
    reloadApiKey,
    reloadOpenAIParams,
  ]);

  return {
    authState,
    setAuthState,
    authError,
    onAuthError,
    apiKeyDefaultValue,
    reloadApiKey,
    openaiDefaultBaseUrl,
    openaiDefaultApiKey,
    openaiDefaultModelPro,
    openaiDefaultModelFlash,
    openaiDefaultModelFlashLite,
    openaiDefaultModelEmbedding,
    reloadOpenAIParams,
  };
};
