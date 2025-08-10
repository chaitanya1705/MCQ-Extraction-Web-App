import React, { useState } from 'react';
import { Trash2, Edit3, Check, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { detectLatex, cleanLatex } from '../lib/latex-utils';
import type { MCQ } from '../lib/types';

interface MCQEditorProps {
  mcqs: MCQ[];
  onMCQUpdate: (id: string, updates: Partial<MCQ>) => void;
  onMCQDelete: (id: string) => void;
}

interface EditingState {
  mcqId: string | null;
  field: 'question' | 'option' | null;
  optionIndex?: number;
}

export default function MCQEditor({ mcqs, onMCQUpdate, onMCQDelete }: MCQEditorProps) {
  const [editing, setEditing] = useState<EditingState>({ mcqId: null, field: null });
  const [editValue, setEditValue] = useState('');

  const startEditing = (mcqId: string, field: 'question' | 'option', optionIndex?: number) => {
    const mcq = mcqs.find(m => m.id === mcqId);
    if (!mcq) return;

    const value = field === 'question' 
      ? mcq.question 
      : mcq.options[optionIndex || 0] || '';

    setEditing({ mcqId, field, optionIndex });
    setEditValue(value);
  };

  const saveEdit = () => {
    if (!editing.mcqId || !editing.field) return;

    const cleanedValue = detectLatex(editValue) ? cleanLatex(editValue) : editValue;

    if (editing.field === 'question') {
      onMCQUpdate(editing.mcqId, { question: cleanedValue });
    } else if (editing.field === 'option' && editing.optionIndex !== undefined) {
      const mcq = mcqs.find(m => m.id === editing.mcqId);
      if (mcq) {
        const newOptions = [...mcq.options];
        newOptions[editing.optionIndex] = cleanedValue;
        onMCQUpdate(editing.mcqId, { options: newOptions });
      }
    }

    cancelEdit();
  };

  const cancelEdit = () => {
    setEditing({ mcqId: null, field: null });
    setEditValue('');
  };

  const setCorrectAnswer = (mcqId: string, answer: string) => {
    onMCQUpdate(mcqId, { correct_answer: answer });
  };

  const renderText = (text: string) => {
    if (!text) return <span className="text-gray-400 italic">No text</span>;

    if (detectLatex(text)) {
      // Split text into LaTeX and regular parts
      const parts = text.split(/(\$[^$]+\$)/g);
      
      return (
        <span>
          {parts.map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$')) {
              const mathContent = part.slice(1, -1);
              return (
                <InlineMath key={index} math={mathContent} />
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </span>
      );
    }

    return <span>{text}</span>;
  };

  if (mcqs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <Edit3 className="h-16 w-16 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600">No MCQs Found</h3>
          <p className="text-gray-500 mt-2">
            Go back to select questions and options from your PDF.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Extracted MCQs ({mcqs.length})
          </h2>
          <div className="text-sm text-gray-500">
            Click any text to edit • LaTeX support included
          </div>
        </div>

        <div className="space-y-8">
          {mcqs.map((mcq, mcqIndex) => (
            <div key={mcq.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              {/* Question Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                      Question {mcqIndex + 1}
                    </span>
                    <span className="text-xs text-gray-500">Page {mcq.page}</span>
                  </div>
                  
                  {/* Question Text */}
                  <div className="mb-4">
                    {editing.mcqId === mcq.id && editing.field === 'question' ? (
                      <div className="space-y-2">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={3}
                          placeholder="Enter question text (LaTeX supported with $ symbols)"
                        />
                        <div className="flex space-x-2">
                          <button
                            onClick={saveEdit}
                            className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                          >
                            <Check className="h-4 w-4" />
                            <span>Save</span>
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center space-x-1 px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                          >
                            <X className="h-4 w-4" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => startEditing(mcq.id, 'question')}
                        className="text-lg font-medium text-gray-900 cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 transition-colors"
                      >
                        {renderText(mcq.question)}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onMCQDelete(mcq.id)}
                  className="flex items-center space-x-1 px-3 py-1 text-red-600 hover:bg-red-50 rounded text-sm transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Options:</h4>
                {mcq.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={`correct-${mcq.id}`}
                        checked={mcq.correct_answer === option}
                        onChange={() => setCorrectAnswer(mcq.id, option)}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-600">
                        {String.fromCharCode(65 + optionIndex)}.
                      </span>
                    </div>

                    <div className="flex-1">
                      {editing.mcqId === mcq.id && editing.field === 'option' && editing.optionIndex === optionIndex ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter option text (LaTeX supported)"
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={saveEdit}
                              className="flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              <Check className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center space-x-1 px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                            >
                              <X className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditing(mcq.id, 'option', optionIndex)}
                          className={`p-2 rounded cursor-pointer border border-transparent hover:border-gray-200 transition-colors ${
                            mcq.correct_answer === option 
                              ? 'bg-green-50 text-green-800' 
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {renderText(option)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Correct Answer Indicator */}
              {mcq.correct_answer && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">Correct Answer:</span>
                    <span className="text-sm text-green-700">{renderText(mcq.correct_answer)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* LaTeX Preview Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">LaTeX Support</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• Use $ symbols for inline math: <code>$x^2 + y^2 = z^2$</code></p>
          <p>• Common symbols: <code>\frac{'{a}'}{'{b}'}</code>, <code>\sqrt{'{x}'}</code>, <code>\alpha</code>, <code>\beta</code></p>
          <p>• Superscripts: <code>x^2</code>, Subscripts: <code>x_1</code></p>
        </div>
      </div>
    </div>
  );
}