import React, { useState, useCallback } from 'react';
import { Key, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { GeminiExtractor } from '../lib/gemini-utils';

interface ApiKeyManagerProps {
  onApiKeySet: (apiKey: string) => void;
  currentApiKey?: string;
}

export default function ApiKeyManager({ onApiKeySet, currentApiKey }: ApiKeyManagerProps) {
  const [apiKey, setApiKey] = useState(currentApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [showSetup, setShowSetup] = useState(!currentApiKey);

  const validateAndSetApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setValidationStatus('invalid');
      return;
    }

    setIsValidating(true);
    setValidationStatus('idle');

    try {
      const extractor = new GeminiExtractor();
      const isValid = await extractor.validateApiKey(apiKey.trim());
      
      if (isValid) {
        setValidationStatus('valid');
        onApiKeySet(apiKey.trim());
        setShowSetup(false);
        
        // Store API key in session (not localStorage for security)
        sessionStorage.setItem('gemini_api_key', apiKey.trim());
      } else {
        setValidationStatus('invalid');
      }
    } catch (error) {
      console.error('API key validation failed:', error);
      setValidationStatus('invalid');
    } finally {
      setIsValidating(false);
    }
  }, [apiKey, onApiKeySet]);

  const handleRemoveApiKey = useCallback(() => {
    setApiKey('');
    setValidationStatus('idle');
    setShowSetup(true);
    onApiKeySet('');
    sessionStorage.removeItem('gemini_api_key');
  }, [onApiKeySet]);

  if (!showSetup && currentApiKey) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Gemini API Connected
            </span>
            <span className="text-xs text-green-600">
              (Key: ****{currentApiKey.slice(-4)})
            </span>
          </div>
          <button
            onClick={() => setShowSetup(true)}
            className="text-sm text-green-700 hover:text-green-900 underline"
          >
            Change Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center space-x-3 mb-4">
        <Key className="h-6 w-6 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          Gemini API Configuration
        </h3>
      </div>

      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-2">Why Gemini API?</p>
              <ul className="space-y-1 text-xs">
                <li>• Superior OCR accuracy for complex mathematical content</li>
                <li>• Native LaTeX and symbol recognition</li>
                <li>• Better handling of academic document layouts</li>
                <li>• Advanced text understanding and formatting</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setValidationStatus('idle');
                }}
                placeholder="Enter your Gemini API key..."
                className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isValidating}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-12 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              
              {validationStatus === 'valid' && (
                <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
              {validationStatus === 'invalid' && (
                <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-500" />
              )}
            </div>
            
            {validationStatus === 'invalid' && (
              <p className="mt-1 text-sm text-red-600">
                Invalid API key. Please check your key and try again.
              </p>
            )}
          </div>

          <button
            onClick={validateAndSetApiKey}
            disabled={!apiKey.trim() || isValidating}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
          >
            {isValidating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Connect & Validate</span>
              </>
            )}
          </button>

          {currentApiKey && (
            <button
              onClick={handleRemoveApiKey}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
            >
              <AlertCircle className="h-4 w-4" />
              <span>Remove API Key</span>
            </button>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="text-sm text-gray-600 space-y-2">
            <p className="font-medium">How to get your Gemini API Key:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs ml-2">
              <li>Visit Google AI Studio</li>
              <li>Sign in with your Google account</li>
              <li>Create a new API key</li>
              <li>Copy and paste it above</li>
            </ol>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-xs underline"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Get API Key</span>
            </a>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              <p className="font-medium">Privacy & Security:</p>
              <p>Your API key is stored only in your browser session and never sent to our servers. It's used directly to communicate with Google's API from your browser.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}