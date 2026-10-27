package com.example.cpen321application.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.testing.E2eTest
import com.example.cpen321application.ui.common.TestTags
import java.time.LocalDate
import java.time.LocalTime
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

private const val TRIP_DAYS = 3
private const val FIRST_DAY_OFFSET = 7L
private const val TOO_LONG_EXTRA_DAYS = 8L

/** Use Case 3, Generate Itinerary, as designed in documentation/Testing.md section 4.2. */
@RunWith(AndroidJUnit4::class)
class GenerateItineraryTest : E2eTest() {
    @Test
    fun generatesADayByDayPlanAndExplainsWhatIsMissing() {
        val firstDay = LocalDate.now().plusDays(FIRST_DAY_OFFSET)
        val lastDay = firstDay.plusDays(TRIP_DAYS - 1L)
        startOnHome()

        // 1-2. "Plan a trip" opens the Trip Builder.
        clickTag(TestTags.HOME_PLAN_TRIP)
        tagged(TestTags.TRIP_CITY_FIELD).assertIsDisplayed()
        tagged(TestTags.GENERATE_BUTTON).performScrollTo().assertTextContains("Generate itinerary")

        // 3a. No destination.
        tagged(TestTags.TRIP_CITY_FIELD).performScrollTo().performTextClearance()
        clickTag(TestTags.GENERATE_BUTTON)
        tagged(TestTags.TRIP_ERROR).assertTextContains("Enter a destination city.")
        tagged(TestTags.TRIP_CITY_FIELD).assertExists()

        // 3b. No dates.
        tagged(TestTags.TRIP_CITY_FIELD).performScrollTo().performTextInput("Vancouver")
        clickTag(TestTags.GENERATE_BUTTON)
        tagged(TestTags.TRIP_ERROR).assertTextContains("Choose your trip dates.")

        // 3c. Longer than 7 days.
        chooseTripDates(firstDay, firstDay.plusDays(TOO_LONG_EXTRA_DAYS))
        clickTag(TestTags.GENERATE_BUTTON)
        tagged(TestTags.TRIP_ERROR).assertTextContains("Trips can be at most 7 days.")

        // 3. Three days, starting a week from today.
        chooseTripDates(firstDay, lastDay)
        tagged(TestTags.TRIP_DATES_BUTTON).assertTextContains("3 days", substring = true)

        // 4a. A day shorter than 2 hours (the day ends at 18:00).
        chooseTime("Start", "17:00")
        clickTag(TestTags.GENERATE_BUTTON)
        tagged(TestTags.TRIP_ERROR).assertTextContains("Your day must end at least 2 hours after it starts.")
        chooseTime("Start", "09:00")

        // 4. Arrive at 13:00, toggle Museums, relaxed pace.
        chooseTime("Arrive", "13:00")
        clickText("Museums")
        clickText("Relaxed")

        // 5-7. Generate, and see a three-day timeline whose first day starts after the arrival.
        clickTag(TestTags.GENERATE_BUTTON)
        waitFor(hasTestTag(TestTags.ITINERARY_DAY))
        waitFor(stopTime())
        val firstStart = LocalTime.parse(stopTimes().first().substringBefore(" to "))
        assertTrue("The first stop starts at $firstStart, before the 13:00 arrival", firstStart >= LocalTime.of(13, 0))
        scrollListTo(hasText("Back at lodging by", substring = true, ignoreCase = true))
        for (day in 1..TRIP_DAYS) {
            scrollListTo(hasText("Day $day of $TRIP_DAYS", substring = true, ignoreCase = true))
        }

        // 6b. A lodging that cannot be found: the days start from the city centre, with a warning.
        pressBack()
        startOnHome()
        clickTag(TestTags.HOME_PLAN_TRIP)
        typeInto(TestTags.TRIP_CITY_FIELD, "Vancouver")
        chooseTripDates(firstDay, lastDay)
        typeInto(TestTags.TRIP_LODGING_FIELD, "no such place zzzz")
        clickTag(TestTags.GENERATE_BUTTON)
        waitFor(hasTestTag(TestTags.ITINERARY_WARNING))
        compose.onNode(hasText("Could not find", substring = true) and hasAnyAncestor(hasTestTag(TestTags.ITINERARY_WARNING)))
            .assertIsDisplayed()
        compose.onNode(hasText("From Vancouver centre")).assertIsDisplayed()
    }
}
