package com.example.cpen321application.data

/** Shared trips: posting, the feed, likes, comments, and copying a shared trip into your own trips. */
class PostRepository(private val api: PostApi) {
    suspend fun share(itineraryId: String, rating: Int, caption: String): Result<PostDetail> =
        apiCall { api.createPost(CreatePostRequest(itineraryId, rating, caption.trim())) }

    /** A page of the friends or everyone feed, newest first; `before` is the last post's time, for the next page. */
    suspend fun feed(feed: String, city: String?, before: String? = null): Result<List<Post>> =
        apiCall { api.posts(feed, city?.trim()?.ifBlank { null }, null, before) }.map { response -> response.posts }

    /** One traveller's posts that you may see. */
    suspend fun postsBy(authorId: String): Result<List<Post>> = apiCall { api.posts(null, null, authorId, null) }.map { it.posts }

    suspend fun post(postId: String): Result<PostDetail> = apiCall { api.post(postId) }

    suspend fun delete(postId: String): Result<Unit> = apiCall { api.deletePost(postId) }

    suspend fun setLiked(postId: String, liked: Boolean): Result<LikeState> = apiCall { if (liked) api.like(postId) else api.unlike(postId) }

    suspend fun comments(postId: String): Result<List<PostComment>> = apiCall { api.comments(postId) }.map { it.comments }

    suspend fun comment(postId: String, text: String): Result<PostComment> = apiCall { api.addComment(postId, CommentRequest(text.trim())) }

    suspend fun deleteComment(postId: String, commentId: String): Result<Unit> = apiCall { api.deleteComment(postId, commentId) }

    /** Copies the shared trip into your own trips, starting on `startDate` (YYYY-MM-DD). */
    suspend fun copy(postId: String, startDate: String): Result<Itinerary> = apiCall { api.copyPost(postId, CopyPostRequest(startDate)) }
}
