package com.example.cpen321application.nfr

import android.os.SystemClock
import android.util.Log
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.SessionStore
import com.example.cpen321application.testing.E2eTest
import com.example.cpen321application.ui.common.TestTags
import java.time.LocalDate
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

private const val FIRST_DAY_OFFSET = 7L
// NFR 2: a change reaches every member's open screen within 2 seconds.
private const val LIMIT_MS = 2_000L
// How long to wait at most, so a failure reports the time it took rather than timing out at the limit.
private const val WAIT_MS = 10_000L

/**
 * NFR 2 on the phone, as Testing.md section 3 describes: with a trip open, a change made elsewhere (the test changes the
 * trip through the REST API, as another member's device would) shows on screen within 2 seconds. The app only learns of
 * it through its live connection, so this times the whole path: the server saving it, Socket.io, and the screen.
 */
@RunWith(AndroidJUnit4::class)
class LiveUpdateRenderTest : E2eTest() {
    private val http = OkHttpClient()
    private val token = SessionStore(InstrumentationRegistry.getInstrumentation().targetContext).token.orEmpty()

    @Test
    fun anotherMembersChangeShowsWithinTwoSeconds() {
        // A trip to change, open and live.
        val firstDay = LocalDate.now().plusDays(FIRST_DAY_OFFSET)
        startOnHome()
        clickTag(TestTags.HOME_PLAN_TRIP)
        typeInto(TestTags.TRIP_CITY_FIELD, "Vancouver")
        chooseTripDates(firstDay, firstDay.plusDays(1))
        chooseTime("Start", "11:00")
        clickTag(TestTags.GENERATE_BUTTON)
        waitFor(hasTestTag(TestTags.LIVE_STATUS) and hasText("LIVE:", substring = true))
        waitFor(stopTime())

        // The trip's first stop, as the server has it, on screen.
        val tripId = call("GET", "api/trips").getJSONArray("trips").getJSONObject(0).getString("id")
        val trip = call("GET", "api/trips/$tripId")
        val stop = trip.getJSONArray("days").getJSONObject(0).getJSONArray("stops").getJSONObject(0)
        val onScreen = hasText(stop.getString("name")) and hasAnyAncestor(hasTestTag(TestTags.TRIP_STOP))
        waitFor(onScreen)

        // Another device removes it; time until this screen no longer shows it.
        val change = JSONObject()
            .put("action", "remove")
            .put("version", trip.getInt("version"))
            .put("dayIndex", 0)
            .put("activityId", stop.getString("activityId"))
        val started = SystemClock.elapsedRealtime()
        call("POST", "api/trips/$tripId/adjust", change)
        waitForNo(onScreen, WAIT_MS)
        val elapsed = SystemClock.elapsedRealtime() - started

        Log.i("NFR", "Live update on screen after $elapsed ms (limit $LIMIT_MS ms)")
        assertTrue("The change took $elapsed ms to show; the limit is $LIMIT_MS ms", elapsed <= LIMIT_MS)
    }

    // One request to the back-end with this device's session, as another member's device would send it.
    private fun call(method: String, path: String, body: JSONObject? = null): JSONObject {
        val request = Request.Builder()
            .url(BuildConfig.API_BASE_URL.trimEnd('/') + "/" + path)
            .header("Authorization", "Bearer $token")
            .method(method, body?.toString()?.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "$method /$path answered ${response.code}" }
            return JSONObject(response.body?.string().orEmpty())
        }
    }
}
