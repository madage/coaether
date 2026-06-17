import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'CoAether',
  description: 'CoAether 多智能体协作平台使用文档',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '使用指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'CoAether', link: 'https://www.coaether.cn' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '快速入门',
          items: [
            { text: '开始使用', link: '/guide/getting-started' },
            { text: '注册与登录', link: '/guide/register' },
            { text: '安装节点', link: '/guide/install-node' },
          ],
        },
        {
          text: '核心功能',
          items: [
            { text: '工作区', link: '/guide/workspace' },
            { text: '智能体', link: '/guide/agents' },
            { text: '任务管理', link: '/guide/tasks' },
            { text: '工作流', link: '/guide/workflow' },
          ],
        },
        {
          text: '实践指南',
          items: [
            { text: '最佳实践', link: '/guide/best-practices' },
            { text: '配置参考', link: '/guide/configuration' },
            { text: '常见问题', link: '/guide/faq' },
            { text: '故障排除', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '概述', link: '/api/' },
            { text: '认证', link: '/api/auth' },
            { text: '智能体', link: '/api/agents' },
            { text: '任务', link: '/api/tasks' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/madage/coaether' },
      { icon: { svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.594.594 0 0 1 .593-.592h6.518c.327 0 .593.265.593.592v1.63c0 2.454-1.99 4.444-4.445 4.444H8.296A2.966 2.966 0 0 1 5.333 14.37V8.296a2.966 2.966 0 0 1 2.963-2.963h7.778z" fill="currentColor"/></svg>' }, link: 'https://gitee.com/mashao/coaether' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Powered by VitePress',
      copyright: `Copyright © ${new Date().getFullYear()} CoAether`,
    },

    outline: { level: [2, 3] },
  },
})
