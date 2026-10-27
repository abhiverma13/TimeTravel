package com.example.cpen321application.data

const val FEED_FRIENDS = "friends"
const val FEED_EVERYONE = "everyone"

/** Posts come a page at a time, this many to a page. */
const val FEED_PAGE_SIZE = 20

data class PostAuthor(val id: String, val name: String)

/** A shared trip in the feed. */
data class Post(
    val id: String,
    val author: PostAuthor,
    val city: String,
    val startDate: String,
    val endDate: String,
    val dayCount: Int,
    val stopCount: Int,
    val rating: Int,
    val caption: String,
    val likeCount: Int,
    val likedByMe: Boolean,
    val commentCount: Int,
    /** True for your own posts, which you may delete. */
    val mine: Boolean,
    val createdAt: String,
)

data class PostStop(
    val activityId: String,
    val name: String,
    val interests: List<String>,
    val startTime: String,
    val endTime: String,
    val travelMinutes: Int,
    val communityScore: Double,
)

data class PostDay(val date: String, val weekday: Int, val returnTravelMinutes: Int, val stops: List<PostStop>)

/** The frozen trip a post shares. */
data class PostTrip(
    val dayStart: String,
    val dayEnd: String,
    val pace: String,
    val transportMode: String,
    val budget: String,
    val interests: List<String>,
    val lodging: String,
    val days: List<PostDay>,
)

/** A post with its trip, for reading it in full. */
data class PostDetail(
    val id: String,
    val author: PostAuthor,
    val city: String,
    val startDate: String,
    val endDate: String,
    val dayCount: Int,
    val stopCount: Int,
    val rating: Int,
    val caption: String,
    val likeCount: Int,
    val likedByMe: Boolean,
    val commentCount: Int,
    val mine: Boolean,
    val createdAt: String,
    val trip: PostTrip,
) {
    /** The same post as the feed shows it. */
    fun summary(): Post =
        Post(id, author, city, startDate, endDate, dayCount, stopCount, rating, caption, likeCount, likedByMe, commentCount, mine, createdAt)
}

data class PostsResponse(val posts: List<Post>)

data class CreatePostRequest(val itineraryId: String, val rating: Int, val caption: String)

data class LikeState(val likeCount: Int, val likedByMe: Boolean)

data class PostComment(val id: String, val author: PostAuthor, val text: String, val mine: Boolean, val createdAt: String)

data class CommentsResponse(val comments: List<PostComment>)

data class CommentRequest(val text: String)

data class CopyPostRequest(val startDate: String)
