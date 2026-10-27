import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { isIsoDate } from '../itineraries/tripCalendar';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { FEEDS, type PostService } from './postService';

const MAX_CAPTION_LENGTH = 500;
const MAX_COMMENT_LENGTH = 300;

const objectId = (what: string) => z.string().refine((id) => isValidObjectId(id), `must be ${what} id`);

const createPostBody = z.object({
  itineraryId: objectId('an itinerary'),
  rating: z.number().int().min(1).max(5),
  caption: z.string().trim().max(MAX_CAPTION_LENGTH).default(''),
});

const feedQuery = z.object({
  feed: z.enum(FEEDS).default('everyone'),
  city: z.string().trim().min(1).max(80).optional(),
  authorId: objectId('a user').optional(),
  before: z.iso.datetime().optional(),
});

const commentBody = z.object({ text: z.string().trim().min(1, 'text is required').max(MAX_COMMENT_LENGTH) });

const copyBody = z.object({ startDate: z.string().refine(isIsoDate, 'must be a date written YYYY-MM-DD') });

/**
 * POST   /api/posts
 * GET    /api/posts?feed=friends|everyone&city=<city>&authorId=<id>&before=<ISO time>
 * GET    /api/posts/:postId
 * DELETE /api/posts/:postId
 * PUT    /api/posts/:postId/like
 * DELETE /api/posts/:postId/like
 * GET    /api/posts/:postId/comments
 * POST   /api/posts/:postId/comments
 * DELETE /api/posts/:postId/comments/:commentId
 * POST   /api/posts/:postId/copy
 */
export function createPostRouter(authService: AuthService, postService: PostService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.post('/', async (request, response) => {
    const post = createPostBody.parse(request.body);
    response.status(201).json(await postService.createPost(authenticatedUserId(response), post));
  });

  router.get('/', async (request, response) => {
    const { before, ...query } = feedQuery.parse(request.query);
    const posts = await postService.listPosts(authenticatedUserId(response), { ...query, before: before === undefined ? undefined : new Date(before) });
    response.json({ posts });
  });

  router.get('/:postId', async (request, response) => {
    response.json(await postService.getPost(authenticatedUserId(response), request.params.postId));
  });

  router.delete('/:postId', async (request, response) => {
    await postService.deletePost(authenticatedUserId(response), request.params.postId);
    response.status(204).end();
  });

  router.put('/:postId/like', async (request, response) => {
    response.json(await postService.setLike(authenticatedUserId(response), request.params.postId, true));
  });

  router.delete('/:postId/like', async (request, response) => {
    response.json(await postService.setLike(authenticatedUserId(response), request.params.postId, false));
  });

  router.get('/:postId/comments', async (request, response) => {
    response.json({ comments: await postService.listComments(authenticatedUserId(response), request.params.postId) });
  });

  router.post('/:postId/comments', async (request, response) => {
    const { text } = commentBody.parse(request.body);
    response.status(201).json(await postService.addComment(authenticatedUserId(response), request.params.postId, text));
  });

  router.delete('/:postId/comments/:commentId', async (request, response) => {
    await postService.deleteComment(authenticatedUserId(response), request.params.postId, request.params.commentId);
    response.status(204).end();
  });

  router.post('/:postId/copy', async (request, response) => {
    const { startDate } = copyBody.parse(request.body);
    response.status(201).json(await postService.copyPost(authenticatedUserId(response), request.params.postId, startDate));
  });

  return router;
}
