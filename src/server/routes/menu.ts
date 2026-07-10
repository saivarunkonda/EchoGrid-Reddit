import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { todayDateStr } from '../lib/gameEngine';

export const menu = new Hono();

// Menu action: Create a new daily EchoGrid post
// This is triggered from the Reddit app menu (mod action)
menu.post('/create-post', async (c) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName) {
      return c.json({ error: 'No subreddit context' }, 400);
    }

    const date = todayDateStr();
    const post = await reddit.submitPost({
      subredditName,
      title: `🌊 EchoGrid — Daily Puzzle ${date} | Place Your Echo!`,
      preview: `EchoGrid ${date}`,
    });

    return c.json({ postId: post.id, url: post.url });
  } catch (e) {
    console.error('Create post error:', e);
    return c.json({ error: String(e) }, 500);
  }
});
