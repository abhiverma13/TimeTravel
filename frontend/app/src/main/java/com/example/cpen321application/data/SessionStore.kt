package com.example.cpen321application.data

import android.content.Context

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

    private companion object {
        const val PREFERENCES_NAME = "timetravel_session"
        const val KEY_TOKEN = "session_token"
    }
}
