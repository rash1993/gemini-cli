/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';

/**
 * Parameters for basic arithmetic operations.
 */
export interface ArithmeticParams {
  a: number;
  b: number;
}

/**
 * Parameters for the greet operation.
 */
export interface GreetParams {
  name: string;
}

/**
 * Union type for all calculator operation parameters.
 */
export type CalculatorParams = ArithmeticParams | GreetParams;

/**
 * Calculator tool providing basic arithmetic operations.
 * Includes add, multiply, and greet functions.
 */
export class CalculatorTool extends BaseTool<CalculatorParams, ToolResult> {
  static readonly Name: string = 'calculator';

  constructor() {
    super(
      CalculatorTool.Name,
      'Calculator',
      'Performs basic arithmetic operations including addition, multiplication, and greeting. Use "add" to add two numbers, "multiply" to multiply two numbers, or "greet" to greet someone.',
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['add', 'multiply', 'greet'],
            description: 'The operation to perform: add, multiply, or greet',
          },
          a: {
            type: 'number',
            description:
              'First number (required for add and multiply operations)',
          },
          b: {
            type: 'number',
            description:
              'Second number (required for add and multiply operations)',
          },
          name: {
            type: 'string',
            description: 'Name to greet (required for greet operation)',
          },
        },
        required: ['operation'],
      },
    );
  }

  validateParams(params: any): string | null {
    if (!params || typeof params !== 'object') {
      return 'Parameters must be an object';
    }

    const { operation } = params;
    if (!operation || typeof operation !== 'string') {
      return 'Operation must be specified as a string';
    }

    switch (operation) {
      case 'add':
      case 'multiply':
        if (typeof params.a !== 'number' || typeof params.b !== 'number') {
          return `For ${operation} operation, both 'a' and 'b' must be numbers`;
        }
        break;
      case 'greet':
        if (!params.name || typeof params.name !== 'string') {
          return 'For greet operation, name must be a non-empty string';
        }
        break;
      default:
        return `Unsupported operation: ${operation}. Supported operations are: add, multiply, greet`;
    }

    return null;
  }

  getDescription(params: any): string {
    const { operation } = params;
    switch (operation) {
      case 'add':
        return `Adding ${params.a} + ${params.b}`;
      case 'multiply':
        return `Multiplying ${params.a} × ${params.b}`;
      case 'greet':
        return `Greeting ${params.name}`;
      default:
        return `Performing calculator operation: ${operation}`;
    }
  }

  async execute(params: any, _signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { operation } = params;

    try {
      let result: any;
      let message: string;

      switch (operation) {
        case 'add':
          result = params.a + params.b;
          message = `${params.a} + ${params.b} = ${result}`;
          break;
        case 'multiply':
          result = params.a * params.b;
          message = `${params.a} × ${params.b} = ${result}`;
          break;
        case 'greet':
          result = `Hello, ${params.name}! Nice to meet you.`;
          message = result;
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return {
        llmContent: JSON.stringify({
          success: true,
          operation,
          result,
          message,
        }),
        returnDisplay: message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[CalculatorTool] Error executing ${operation}:`,
        errorMessage,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Calculator operation failed: ${errorMessage}`,
        }),
        returnDisplay: `Error: Calculator operation failed: ${errorMessage}`,
      };
    }
  }
}
