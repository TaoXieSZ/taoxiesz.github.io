import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    author: z.string().default('谢韬'),
    project: z.enum(['openclaw', 'mewagents', 'feishu', 'claude-code', 'oh-my-cursor', 'agent-farm', 'context-os', 'agent-tickets']).optional()
  })
});

export const collections = { blog };
