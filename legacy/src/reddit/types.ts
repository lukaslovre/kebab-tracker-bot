/**
 * Minimal, stable subset of Reddit comment fields we care about.
 *
 * We map this from the raw listing JSON so the rest of the app doesn't depend
 * on Reddit's full response shape.
 */
export type RedditComment = {
  id: string;
  fullname: string;
  author: string;
  body: string;
  createdUtcSeconds: number;
  permalink?: string;
  subreddit?: string;
};
