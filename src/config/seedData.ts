import type { Category, LinkItem } from '../types';

const isZhLocale = (locale: string): boolean => locale.toLowerCase().startsWith('zh');

export const buildSeedCategories = (locale: string): Category[] => {
  const isZh = isZhLocale(locale);
  return [
    { id: 'common', name: isZh ? '常用推荐' : 'Favorites', icon: 'Star' },
    { id: 'dev', name: isZh ? '开发工具' : 'Developer Tools', icon: 'Code' },
    { id: 'design', name: isZh ? '设计资源' : 'Design Resources', icon: 'Palette' },
    { id: 'read', name: isZh ? '阅读资讯' : 'Reading', icon: 'BookOpen' },
    { id: 'ent', name: isZh ? '休闲娱乐' : 'Entertainment', icon: 'Gamepad2' },
    { id: 'ai', name: isZh ? '人工智能' : 'AI', icon: 'Bot' },
  ];
};

export const buildSeedLinks = (locale: string): LinkItem[] => {
  const isZh = isZhLocale(locale);
  const now = Date.now();

  return [
    {
      id: '1',
      title: 'GitHub',
      url: 'https://github.com',
      categoryId: 'dev',
      createdAt: now,
      description: isZh ? '代码托管平台' : 'Code hosting platform',
      pinned: true,
      icon: 'https://www.faviconextractor.com/favicon/github.com?larger=true',
    },
    {
      id: '2',
      title: 'React',
      url: 'https://react.dev',
      categoryId: 'dev',
      createdAt: now,
      description: isZh ? '构建 Web 用户界面的库' : 'A library for building web user interfaces',
      pinned: true,
      icon: 'https://www.faviconextractor.com/favicon/react.dev?larger=true',
    },
    {
      id: '3',
      title: 'Tailwind CSS',
      url: 'https://tailwindcss.com',
      categoryId: 'design',
      createdAt: now,
      description: isZh ? '原子化 CSS 框架' : 'Utility-first CSS framework',
      pinned: true,
      icon: 'https://www.faviconextractor.com/favicon/tailwindcss.com?larger=true',
    },
    {
      id: '4',
      title: 'ChatGPT',
      url: 'https://chat.openai.com',
      categoryId: 'ai',
      createdAt: now,
      description: isZh ? 'OpenAI 聊天机器人' : 'OpenAI chatbot',
      pinned: true,
      icon: 'https://www.faviconextractor.com/favicon/chat.openai.com?larger=true',
    },
    {
      id: '5',
      title: 'Gemini',
      url: 'https://gemini.google.com',
      categoryId: 'ai',
      createdAt: now,
      description: 'Google DeepMind AI',
      pinned: true,
      icon: 'https://www.faviconextractor.com/favicon/gemini.google.com?larger=true',
    },
    {
      id: '6',
      title: 'Vercel',
      url: 'https://vercel.com',
      categoryId: 'dev',
      createdAt: now,
      description: isZh ? '前端部署与托管平台' : 'Frontend deployment and hosting',
      icon: 'https://www.faviconextractor.com/favicon/vercel.com?larger=true',
    },
    {
      id: '7',
      title: 'Figma',
      url: 'https://figma.com',
      categoryId: 'design',
      createdAt: now,
      description: isZh ? '在线协作界面设计工具' : 'Collaborative UI design tool',
      icon: 'https://www.faviconextractor.com/favicon/figma.com?larger=true',
    },
    {
      id: '8',
      title: 'Hacker News',
      url: 'https://news.ycombinator.com',
      categoryId: 'read',
      createdAt: now,
      description: isZh ? '极客新闻聚合社区' : 'Tech news aggregator',
      icon: 'https://www.faviconextractor.com/favicon/news.ycombinator.com?larger=true',
    },
    {
      id: '9',
      title: 'YouTube',
      url: 'https://youtube.com',
      categoryId: 'ent',
      createdAt: now,
      description: isZh ? '全球最大的视频分享网站' : 'Video sharing platform',
      icon: 'https://www.faviconextractor.com/favicon/youtube.com?larger=true',
    },
    {
      id: '10',
      title: 'Claude',
      url: 'https://claude.ai',
      categoryId: 'ai',
      createdAt: now,
      description: isZh ? 'Anthropic AI 助手' : 'Anthropic AI assistant',
      icon: 'https://www.faviconextractor.com/favicon/claude.ai?larger=true',
    },
    {
      id: '11',
      title: 'Dribbble',
      url: 'https://dribbble.com',
      categoryId: 'design',
      createdAt: now,
      description: isZh ? '设计师作品分享社区' : 'Designer portfolio community',
      icon: 'https://www.faviconextractor.com/favicon/dribbble.com?larger=true',
    },
    {
      id: '12',
      title: 'VS Code',
      url: 'https://code.visualstudio.com',
      categoryId: 'dev',
      createdAt: now,
      description: isZh ? '微软开源代码编辑器' : 'Microsoft open-source code editor',
      icon: 'https://www.faviconextractor.com/favicon/code.visualstudio.com?larger=true',
    },
    {
      id: '13',
      title: 'Midjourney',
      url: 'https://www.midjourney.com',
      categoryId: 'ai',
      createdAt: now,
      description: isZh ? 'AI 图像生成工具' : 'AI image generation tool',
      icon: 'https://www.faviconextractor.com/favicon/midjourney.com?larger=true',
    },
    {
      id: '14',
      title: 'The Verge',
      url: 'https://www.theverge.com',
      categoryId: 'read',
      createdAt: now,
      description: isZh ? '科技新闻与评测' : 'Technology news and reviews',
      icon: 'https://www.faviconextractor.com/favicon/theverge.com?larger=true',
    },
    {
      id: '15',
      title: 'Netflix',
      url: 'https://www.netflix.com',
      categoryId: 'ent',
      createdAt: now,
      description: isZh ? '流媒体影视平台' : 'Streaming platform',
      icon: 'https://www.faviconextractor.com/favicon/netflix.com?larger=true',
    },
  ];
};
