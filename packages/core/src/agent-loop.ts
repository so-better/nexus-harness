/**
 * 单 Agent 循环：模型调用 → 工具执行 → 结果回填，直到停止条件。
 */

import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ChatProvider,
  ProviderRequest,
  ProviderToolCall,
  ToolSchema
} from '@nexus/providers';
import type { EventPayloadMap, NexusEventType } from '@nexus/shared';
import type { EventBus } from './event-bus';
import type { PermissionGateway, PermissionLevel } from './permissions';
import { createNexusEvent } from './event-factory';
import { ContextLimitError, type ContextPreparer } from './context';

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  artifactId?: string;
  bytes?: number;
  error?: { code: string; message: string };
}

export interface ToolExecutionContext {
  sessionId: string;
  runId?: string;
  signal?: AbortSignal;
}

export type ToolExecutor = (
  call: ProviderToolCall,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

/**
 * Agent 工具定义：在 Provider schema 之外补充权限与审批要求。
 */
export interface AgentToolDefinition extends ToolSchema {
  permission: PermissionLevel;
  requiresApproval: boolean;
}

export interface AgentLoopOptions {
  provider: ChatProvider;
  providerName?: string;
  model: string;
  messages: ChatMessage[];
  tools?: AgentToolDefinition[];
  blockedTools?: string[];
  executeTool?: ToolExecutor;
  eventBus?: EventBus;
  sessionId: string;
  runId?: string;
  maxSteps?: number;
  maxTokens?: number;
  extraParams?: Record<string, unknown>;
  prepareContext?: ContextPreparer;
  permissionGateway?: PermissionGateway;
  sanitizeToolInput?: (call: ProviderToolCall) => unknown;
  approveTool?: (
    call: ProviderToolCall,
    tool: AgentToolDefinition,
    approvalId: string
  ) => Promise<boolean>;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  messages: ChatMessage[];
  steps: number;
  toolCalls: number;
  finishReason: string;
}

const DEFAULT_MAX_STEPS = 10;

/**
 * 执行单次 Run；工具失败会作为 tool 消息回填，让模型自行调整。
 */
export class AgentLoop {
  private readonly options: AgentLoopOptions;
  private messages: ChatMessage[];
  private seq = 1;
  private toolCallCount = 0;
  private readonly approvalStatuses = new Map<string, 'approved' | 'rejected'>();

  constructor(options: AgentLoopOptions) {
    this.options = options;
    this.messages = [...options.messages];
  }

  private emit<T extends NexusEventType>(type: T, payload: EventPayloadMap[T]): void {
    const bus = this.options.eventBus;
    if (!bus) return;

    const input =
      this.options.runId === undefined
        ? { sessionId: this.options.sessionId, seq: this.seq, type, payload }
        : {
            sessionId: this.options.sessionId,
            runId: this.options.runId,
            seq: this.seq,
            type,
            payload
          };

    bus.publish(createNexusEvent(input));
    this.seq += 1;
  }

  async run(): Promise<AgentLoopResult> {
    const startedAt = Date.now();
    const maxSteps = this.options.maxSteps ?? DEFAULT_MAX_STEPS;

    this.emit('run.started', { model: this.options.model });

    for (let step = 1; step <= maxSteps; step += 1) {
      if (this.options.signal?.aborted) {
        this.emit('run.cancelled', { reason: 'aborted' });
        return {
          messages: this.messages,
          steps: step - 1,
          toolCalls: this.toolCallCount,
          finishReason: 'aborted'
        };
      }

      try {
        await this.prepareContext();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof ContextLimitError ? error.code : 'CONTEXT_PREPARE_FAILED';
        this.emit('run.failed', { error: { code, message } });
        throw error instanceof Error ? error : new Error(message);
      }

      const assistantMessageId = randomUUID();
      const result = await this.runStep(assistantMessageId);

      if (this.options.signal?.aborted) {
        this.emit('run.cancelled', { reason: 'aborted' });
        return {
          messages: this.messages,
          steps: step - 1,
          toolCalls: this.toolCallCount,
          finishReason: 'aborted'
        };
      }

      if (result.error) {
        this.emit('run.failed', { error: result.error });
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }

      this.toolCallCount += result.toolCalls.length;

      if (result.text || result.reasoning || result.toolCalls.length) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.text,
          ...(result.reasoning ? { reasoning: result.reasoning } : {}),
          ...(result.toolCalls.length ? { toolCalls: result.toolCalls } : {})
        };
        this.messages.push(assistantMessage);
        this.emit('message.completed', {
          messageId: assistantMessageId,
          role: 'assistant',
          content: result.text,
          ...(result.reasoning ? { reasoning: result.reasoning } : {})
        });
      }

      if (result.toolCalls.length === 0) {
        this.emit('run.completed', { durationMs: Date.now() - startedAt });
        return {
          messages: this.messages,
          steps: step,
          toolCalls: this.toolCallCount,
          finishReason: result.finishReason
        };
      }

      for (const call of result.toolCalls) {
        this.emit('tool.requested', {
          toolCallId: call.id,
          name: call.name,
          input: this.options.sanitizeToolInput?.(call) ?? call.arguments
        });

        const denied = await this.authorizeTool(call);
        if (denied) {
          this.recordToolFailure(call, denied);
          continue;
        }

        const toolResult = await this.executeTool(call);

        if (toolResult.ok) {
          this.emit('tool.completed', {
            toolCallId: call.id,
            ok: true,
            output: toolResult.output,
            ...(toolResult.artifactId === undefined ? {} : { artifactId: toolResult.artifactId }),
            ...(toolResult.bytes === undefined ? {} : { bytes: toolResult.bytes })
          });
        } else {
          this.emit('tool.failed', {
            toolCallId: call.id,
            error: toolResult.error ?? { code: 'TOOL_FAILED', message: '工具执行失败' }
          });
        }

        const approvalStatus = this.approvalStatuses.get(call.id);
        this.approvalStatuses.delete(call.id);
        this.messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: toolResult.ok ? toolResult.output : JSON.stringify(toolResult.error),
          ...(approvalStatus === undefined ? {} : { approvalStatus })
        });
      }

      if (this.options.signal?.aborted) {
        this.emit('run.cancelled', { reason: 'aborted' });
        return {
          messages: this.messages,
          steps: step,
          toolCalls: this.toolCallCount,
          finishReason: 'aborted'
        };
      }
    }

    const error = {
      code: 'RUN_MAX_STEPS',
      message: `超过最大步骤数：${maxSteps}`
    };
    this.emit('run.failed', { error });
    return {
      messages: this.messages,
      steps: maxSteps,
      toolCalls: this.toolCallCount,
      finishReason: 'max_steps'
    };
  }

  /**
   * 调用宿主提供的上下文准备器；压缩事件由循环统一写入，保证序号一致。
   */
  private async prepareContext(): Promise<void> {
    const preparer = this.options.prepareContext;
    if (!preparer) return;

    const prepared = await preparer(this.messages);
    if (prepared.usage && this.options.providerName) {
      this.emit('usage.recorded', {
        provider: this.options.providerName,
        model: this.options.model,
        inputTokens: prepared.usage.inputTokens,
        outputTokens: prepared.usage.outputTokens,
        ...(prepared.usage.cost === undefined ? {} : { cost: prepared.usage.cost })
      });
    }

    if (prepared.compacted) {
      this.emit('context.compacted', {
        beforeTokens: prepared.beforeTokens ?? 0,
        afterTokens: prepared.afterTokens ?? 0,
        strategy: prepared.strategies?.join('+') || 'compacted',
        ...(prepared.summaryRef === undefined ? {} : { summaryRef: prepared.summaryRef }),
        ...(prepared.artifactIds === undefined ? {} : { artifactIds: prepared.artifactIds })
      });
    }

    this.messages = prepared.messages;
  }

  /**
   * 执行一步模型调用，收集文本、工具调用与 usage。
   */
  private async runStep(messageId: string): Promise<{
    text: string;
    reasoning: string;
    toolCalls: ProviderToolCall[];
    finishReason: string;
    error?: { code: string; message: string };
  }> {
    const request: ProviderRequest = {
      model: this.options.model,
      messages: [...this.messages],
      ...(this.options.tools ? { tools: this.options.tools } : {}),
      ...(this.options.extraParams ? { extraParams: this.options.extraParams } : {}),
      ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
      ...(this.options.signal ? { signal: this.options.signal } : {})
    };

    let text = '';
    let reasoning = '';
    let finishReason = 'stop';
    let error: { code: string; message: string } | undefined;
    const toolCalls: ProviderToolCall[] = [];
    let deltaBuffer = '';
    let lastDeltaAt = 0;
    let flushedDelta = false;
    let reasoningBuffer = '';
    let lastReasoningAt = 0;
    let flushedReasoning = false;

    /**
     * 首个增量立即下发保证首字延迟，后续按时间/长度合并后持久化。
     */
    const flushReasoning = (): void => {
      if (!reasoningBuffer) return;
      this.emit('message.reasoning.delta', { messageId, text: reasoningBuffer });
      reasoningBuffer = '';
      lastReasoningAt = Date.now();
      flushedReasoning = true;
    };

    const flushDelta = (): void => {
      if (!deltaBuffer) return;
      this.emit('message.delta', { messageId, text: deltaBuffer });
      deltaBuffer = '';
      lastDeltaAt = Date.now();
      flushedDelta = true;
    };

    try {
      for await (const event of this.options.provider.stream(request)) {
        switch (event.type) {
          case 'reasoning-delta':
            reasoning += event.text;
            if (event.text) {
              reasoningBuffer += event.text;
              const now = Date.now();
              if (
                !flushedReasoning ||
                reasoningBuffer.length >= 96 ||
                (lastReasoningAt > 0 && now - lastReasoningAt >= 80)
              ) {
                flushReasoning();
              }
            }
            break;
          case 'text-delta':
            text += event.text;
            if (event.text) {
              deltaBuffer += event.text;
              const now = Date.now();
              if (
                !flushedDelta ||
                deltaBuffer.length >= 96 ||
                (lastDeltaAt > 0 && now - lastDeltaAt >= 80)
              ) {
                flushDelta();
              }
            }
            break;
          case 'tool-call-end':
            toolCalls.push(event.toolCall);
            break;
          case 'usage':
            if (this.options.providerName) {
              this.emit('usage.recorded', {
                messageId,
                provider: this.options.providerName,
                model: this.options.model,
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                ...(event.usage.cost === undefined ? {} : { cost: event.usage.cost })
              });
            }
            break;
          case 'finish':
            finishReason = event.reason;
            break;
          case 'error':
            error = { code: event.code, message: event.message };
            break;
          default:
            break;
        }

        if (error) break;
      }
    } catch (streamError) {
      error = {
        code: 'PROVIDER_STREAM_FAILED',
        message: streamError instanceof Error ? streamError.message : String(streamError)
      };
    }

    flushReasoning();
    flushDelta();
    return { text, reasoning, toolCalls, finishReason, ...(error ? { error } : {}) };
  }

  /**
   * 工具调用前的权限与审批门禁；拒绝时返回结构化错误。
   */
  private async authorizeTool(
    call: ProviderToolCall
  ): Promise<{ code: string; message: string } | undefined> {
    const tool = this.options.tools?.find((item) => item.name === call.name);
    if (!tool) {
      if (this.options.blockedTools?.includes(call.name)) {
        return { code: 'TOOL_MODE_DENIED', message: `当前模式不可用工具：${call.name}` };
      }
      return { code: 'TOOL_NOT_FOUND', message: `未注册工具：${call.name}` };
    }

    const gateway = this.options.permissionGateway;
    if (!gateway || !gateway.has(tool.permission)) {
      return { code: 'TOOL_PERMISSION_DENIED', message: `缺少工具权限：${tool.permission}` };
    }

    if (tool.requiresApproval) {
      const approve = this.options.approveTool;
      if (!approve) {
        return { code: 'TOOL_APPROVAL_REQUIRED', message: `工具需要审批：${call.name}` };
      }

      const approvalId = randomUUID();
      this.emit('approval.requested', {
        approvalId,
        toolCallId: call.id,
        scope: tool.name
      });

      try {
        const approved = await approve(call, tool, approvalId);
        this.emit('approval.resolved', {
          approvalId,
          decision: approved ? 'approved' : 'rejected'
        });
        this.approvalStatuses.set(call.id, approved ? 'approved' : 'rejected');
        if (!approved) {
          return { code: 'TOOL_APPROVAL_DENIED', message: `工具审批被拒绝：${call.name}` };
        }
      } catch (error) {
        this.approvalStatuses.set(call.id, 'rejected');
        this.emit('approval.resolved', { approvalId, decision: 'rejected' });
        return {
          code: 'TOOL_APPROVAL_FAILED',
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return undefined;
  }

  /**
   * 将门禁失败记录为 tool.failed，并回填给模型。
   */
  private recordToolFailure(
    call: ProviderToolCall,
    error: { code: string; message: string }
  ): void {
    this.emit('tool.failed', { toolCallId: call.id, error });
    const approvalStatus = this.approvalStatuses.get(call.id);
    this.approvalStatuses.delete(call.id);
    this.messages.push({
      role: 'tool',
      toolCallId: call.id,
      content: JSON.stringify(error),
      ...(approvalStatus === undefined ? {} : { approvalStatus })
    });
  }

  /**
   * 执行单个工具调用；没有执行器或执行抛错时转为结构化失败。
   */
  private async executeTool(call: ProviderToolCall): Promise<ToolExecutionResult> {
    const executor = this.options.executeTool;
    if (!executor) {
      return {
        ok: false,
        output: '',
        error: { code: 'TOOL_EXECUTOR_MISSING', message: `工具执行器缺失：${call.name}` }
      };
    }

    const context: ToolExecutionContext =
      this.options.runId === undefined
        ? {
            sessionId: this.options.sessionId,
            ...(this.options.signal ? { signal: this.options.signal } : {})
          }
        : {
            sessionId: this.options.sessionId,
            runId: this.options.runId,
            ...(this.options.signal ? { signal: this.options.signal } : {})
          };

    try {
      return await executor(call, context);
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
