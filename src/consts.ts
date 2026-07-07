export const SITE_TITLE = '谢韬的工作台';
export const SITE_DESCRIPTION = '造 agent、写自动化、拆源码——谢韬的长期工程日志。';
export const SITE_URL = 'https://taoxiesz.github.io';
export const SITE_NAV = [
  { href: '/', label: '首页' },
  { href: '/blog', label: '博客' },
  { href: '/projects', label: '项目' },
  { href: '/tags', label: '标签' },
  { href: '/search', label: '搜索' },
  { href: '/about', label: '关于' }
];

/** Extract the bare filename slug from a content collection id (strips subdirectory and .md) */
export function postSlug(id: string): string {
  return id.replace(/\.md$/, '').split('/').pop()!;
}

export const PROJECTS: Record<string, { label: string; description: string }> = {
  openclaw: { label: 'OpenClaw', description: 'AI Agent 协作系统' },
  mewagents: { label: 'Mewagents', description: '猫猫军团多智能体协作' },
  feishu: { label: 'Feishu 文档自动化', description: '飞书文档交付链路' },
  'claude-code': { label: 'Claude Code', description: '源码分析与产品拆解' },
  'oh-my-cursor': { label: 'Oh My Cursor', description: 'Cursor IDE 工作流编排层' },
  'agent-farm': { label: 'Agent Farm', description: '个人分布式 Agent 运行时:飞书入口、多机引擎、多模型' },
};
