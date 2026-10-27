package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit description of the Feed Service endpoints. */
interface PostApi {
    @POST("api/posts")
    suspend fun createPost(@Body body: CreatePostRequest): PostDetail

    @GET("api/posts")
    suspend fun posts(
        @Query("feed") feed: String?,
        @Query("city") city: String?,
        @Query("authorId") authorId: String?,
        @Query("before") before: String?,
    ): PostsResponse

    @GET("api/posts/{postId}")
    suspend fun post(@Path("postId") postId: String): PostDetail

    @DELETE("api/posts/{postId}")
    suspend fun deletePost(@Path("postId") postId: String)

    @PUT("api/posts/{postId}/like")
    suspend fun like(@Path("postId") postId: String): LikeState

    @DELETE("api/posts/{postId}/like")
    suspend fun unlike(@Path("postId") postId: String): LikeState

    @GET("api/posts/{postId}/comments")
    suspend fun comments(@Path("postId") postId: String): CommentsResponse

    @POST("api/posts/{postId}/comments")
    suspend fun addComment(@Path("postId") postId: String, @Body body: CommentRequest): PostComment

    @DELETE("api/posts/{postId}/comments/{commentId}")
    suspend fun deleteComment(@Path("postId") postId: String, @Path("commentId") commentId: String)

    @POST("api/posts/{postId}/copy")
    suspend fun copyPost(@Path("postId") postId: String, @Body body: CopyPostRequest): Itinerary
}
