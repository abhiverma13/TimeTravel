package com.example.cpen321application.data

import android.content.Context
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Keeps the TimeTravel session token across app restarts, so travellers stay signed in. */
class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    val token: String?
        get() = preferences.getString(KEY_TOKEN, null)

    fun save(token: String) {
        preferences.edit().putString(KEY_TOKEN, token).apply()
    }

    fun clear() {
        preferences.edit().remove(KEY_TOKEN).apply()
    }

    private val expiredEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Fires when the back-end turns the stored session down (it expired, or the server's secret changed). */
    val expired: SharedFlow<Unit> = expiredEvents.asSharedFlow()

    /** Forgets a session the back-end no longer accepts, and tells whoever shows the sign-in screen. */
    fun expire() {
        clear()
        expiredEvents.tryEmit(Unit)
    }

    private companion object {
        const val PREFERENCES_NAME = "timetravel_session"
        const val KEY_TOKEN = "session_token"
    }
}
