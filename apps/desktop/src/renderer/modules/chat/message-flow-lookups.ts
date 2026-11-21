/**
 * 消息流中工具、审批、目录授权与引用对象的纯查询函数。
 */
import type { ChatApproval, ChatAskUser, ChatMessageView, ChatToolCall } from './types';
import type { OutputFile, WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';

export const approvalForTool = (tool: ChatToolCall, approvals: ChatApproval[]): ChatApproval[] =>
  approvals.filter(
    (approval) =>
      approval.id === tool.approvalId &&
      approval.toolCallId === tool.id &&
      approval.status === 'pending'
  );

export const isWorkspaceAuthTool = (
  toolId: string,
  workspaceAuth: WorkspaceAuthorizationRequest | null
): boolean => workspaceAuth?.toolCallId === toolId;

export const isToolInterruption = (
  tool: ChatToolCall,
  approvals: ChatApproval[],
  workspaceAuth: WorkspaceAuthorizationRequest | null
): boolean =>
  isWorkspaceAuthTool(tool.id, workspaceAuth) || approvalForTool(tool, approvals).length > 0;

/**
 * 时间线渲染需要按 id 取回具体对象；返回数组便于模板内 v-for 做类型收窄。
 */
export const toolLookup = (message: ChatMessageView, id: string): ChatToolCall[] => {
  const tool = message.toolCalls.find((item) => item.id === id);
  return tool ? [tool] : [];
};

export const askLookup = (askUsers: ChatAskUser[], id: string): ChatAskUser[] => {
  const ask = askUsers.find((item) => item.requestId === id);
  return ask ? [ask] : [];
};

export const fileLookup = (message: ChatMessageView, id: string): OutputFile[] => {
  const file = message.files?.find((item) => item.id === id);
  return file ? [file] : [];
};
