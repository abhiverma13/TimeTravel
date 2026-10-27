package com.example.cpen321application.data

import android.content.Context
import com.example.cpen321application.BuildConfig

/** Creates the app's long-lived objects once; screens get them through the repositories. */
class AppContainer(context: Context) {
    private val sessionStore = SessionStore(context)
    private val retrofit = ApiClient.create(BuildConfig.API_BASE_URL, sessionStore)

    val repository = TimeTravelRepository(
        retrofit.create(TimeTravelApi::class.java),
        sessionStore,
        GoogleSignInClient(BuildConfig.GOOGLE_CLIENT_ID),
    )
    val groups = GroupRepository(retrofit.create(GroupApi::class.java))
    val friends = FriendRepository(retrofit.create(FriendApi::class.java))
    val posts = PostRepository(retrofit.create(PostApi::class.java))
    val liveItineraries = LiveItineraryClient(BuildConfig.API_BASE_URL, sessionStore)
}
