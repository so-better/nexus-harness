/**
 * 最小 i18n 字典：当前仅提供 zh-CN，后续接入切换时保持 key 不变。
 */

const messages = {
  'app.brand': 'Nexus',
  'app.chooseRoot': '选择目录',
  'app.noRoot': '未选择目录',
  'app.provider': '模型',
  'app.noProvider': '未配置模型',
  'app.newSession': '新建会话',
  'app.inspector': '上下文与用量',
  'app.tokensIn': '输入 token',
  'app.tokensOut': '输出 token',
  'app.cost': '费用',
  'app.status': '状态',
  'app.idle': '空闲',
  'app.running': '运行中',
  'app.stop': '停止',
  'app.send': '发送',
  'app.loading': '加载中',
  'app.sessionCount': '会话数',
  'app.retry': '重试',
  'app.noSession': '未选择会话',
  'app.emptyTitle': '开始一个真实任务',
  'app.emptyDescription': '选择工作目录与模型，然后描述你想完成的事情。',
  'app.emptyNoSession': '先新建一个会话。',
  'session.defaultTitle': '新会话',
  'session.delete': '删除会话',
  'session.pin': '置顶',
  'session.unpin': '取消置顶',
  'session.status.idle': '空闲',
  'session.status.running': '运行中',
  'session.status.waiting_approval': '等待审批',
  'session.status.waiting_user': '等待回答',
  'session.status.completed': '已完成',
  'session.status.failed': '失败',
  'session.status.interrupted': '已中断',
  'session.status.archived': '已归档',
  'session.status.cancelled': '已取消',
  'chat.user': '你',
  'chat.assistant': 'Nexus',
  'chat.system': '系统',
  'chat.composerPlaceholder': '描述任务，Enter 发送，Shift+Enter 换行',
  'chat.needsRoot': '请先选择工作目录',
  'chat.needsProvider': '请先配置模型',
  'chat.busy': '当前任务运行中',
  'chat.approve': '允许',
  'chat.reject': '拒绝',
  'chat.approvalTitle': '需要审批',
  'chat.approvalScope': '操作',
  'chat.contextCompacted': '上下文已压缩',
  'chat.runFailed': '运行失败',
  'chat.runCancelled': '运行已取消',
  'tool.requested': '等待执行',
  'tool.approved': '已批准',
  'tool.waiting_approval': '等待审批',
  'tool.rejected': '已拒绝',
  'tool.running': '执行中',
  'tool.succeeded': '已完成',
  'tool.failed': '失败',
  'tool.artifactId': '产物',
  'tool.input': '参数',
  'tool.output': '输出'
} as const;

export type MessageKey = keyof typeof messages;

/**
 * 读取静态文案；当前没有语言切换，缺少 key 时返回 key 便于排查。
 */
export const t = (key: MessageKey): string => messages[key] ?? key;
