package com.example.cpen321application.data

import android.content.Context
import com.example.cpen321application.BuildConfig

/** Creates the app's long-lived objects once; screens get them through [TimeTravelRepository]. */
class AppContainer(context: Context) {
    private val sessionStore = SessionStore(context)
    private val api = ApiClient.create(BuildConfig.API_BASE_URL, sessionStore)

    val repository = TimeTravelRepository(api, sessionStore, GoogleSignInClient(BuildConfig.GOOGLE_CLIENT_ID))
}
