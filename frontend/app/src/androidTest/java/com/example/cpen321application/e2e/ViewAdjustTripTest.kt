package com.example.cpen321application.e2e

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.testing.E2eTest
import com.example.cpen321application.ui.common.TestTags
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

private const val FIRST_DAY_OFFSET = 10L
private const val OPTIONS_FOR = "Options for "

/** Use Case 4, View & Adjust Itinerary, as designed in documentation/Testing.md section 4.2. */
@RunWith(AndroidJUnit4::class)
class ViewAdjustItineraryTest : E2eTest() {
    @Test
    fun locksMovesAndRemovesStops() {
        val firstDay = LocalDate.now().plusDays(FIRST_DAY_OFFSET)
        startOnHome()

        // The trip to adjust: two days in Vancouver from 11:00, when the places are open.
        clickTag(TestTags.HOME_PLAN_TRIP)
        typeInto(TestTags.TRIP_CITY_FIELD, "Vancouver")
        chooseTripDates(firstDay, firstDay.plusDays(1))
        chooseTime("Start", "11:00")
        clickTag(TestTags.GENERATE_BUTTON)
        waitFor(hasTestTag(TestTags.ITINERARY_DAY))
        pressBack()
        startOnHome()

        // 1-2. Open it from the recent trips; the timeline shows and is live.
        waitFor(hasTestTag(TestTags.RECENT_TRIP))
        compose.onAllNodesWithTag(TestTags.RECENT_TRIP).onFirst().performScrollTo().performClick()
        waitFor(hasTestTag(TestTags.LIVE_STATUS) and hasText("LIVE:", substring = true))
        waitFor(stopTime())
        val first = stopName(0)
        val second = stopName(1)
        val firstTime = stopTimes().first()

        // 3-4. Lock the first stop: it is marked and keeps its time.
        openStopMenu(0)
        clickTag(TestTags.STOP_ACTION_LOCK)
        waitFor(hasTestTag(TestTags.STOP_LOCKED))
        assertEquals(firstTime, stopTimes().first())

        // 4a. Moving the second stop before the locked one cannot work: the app explains and keeps the plan.
        openStopMenu(1)
        clickTag(TestTags.STOP_ACTION_MOVE_EARLIER)
        waitFor(hasText("$second cannot go there", substring = true))
        assertEquals(listOf(first, second), listOf(stopName(0), stopName(1)))

        // 3-4. Remove the second stop: it is gone, and the locked stop has not moved.
        openStopMenu(1)
        clickTag(TestTags.STOP_ACTION_REMOVE)
        waitForNo(hasContentDescription(OPTIONS_FOR + second))
        assertEquals(first, stopName(0))
        assertEquals(firstTime, stopTimes().first())

        // 3-4. Unlock it again.
        openStopMenu(0)
        clickTag(TestTags.STOP_ACTION_LOCK)
        waitForNo(hasTestTag(TestTags.STOP_LOCKED))
    }

    // Stops are named in their menu button's description, "Options for <stop>".
    private fun stopName(index: Int): String {
        val button = compose.onAllNodesWithTag(TestTags.STOP_ACTIONS_BUTTON)[index].fetchSemanticsNode()
        return button.config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString().removePrefix(OPTIONS_FOR)
    }

    private fun openStopMenu(index: Int) {
        compose.onAllNodesWithTag(TestTags.STOP_ACTIONS_BUTTON)[index].performScrollTo().performClick()
    }
}
