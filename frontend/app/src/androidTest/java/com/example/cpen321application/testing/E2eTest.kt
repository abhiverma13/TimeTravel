package com.example.cpen321application.testing

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import com.example.cpen321application.MainActivity
import com.example.cpen321application.ui.common.TestTags
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.junit.Rule

private const val START_TIMEOUT_MS = 20_000L
private const val SERVER_TIMEOUT_MS = 10_000L

// How the date pickers describe a day, for example "November 2, 2026" inside "Monday, November 2, 2026".
private val PICKER_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US)

// A stop's "13:05 to 14:35" line.
private val STOP_TIME = Regex("""\d{2}:\d{2} to \d{2}:\d{2}""")

/**
 * Shared steps for the end-to-end tests in androidTest/e2e. As the course requires, each test starts on the home screen
 * with a signed-in user (sign in once in the app before running them; the session is kept) and runs against the real
 * back-end, so waits allow for the server.
 */
abstract class E2eTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    /** Waits for the signed-in home screen (the Trips tab). */
    fun startOnHome() {
        waitFor(hasTestTag(TestTags.HOME_PLAN_TRIP), START_TIMEOUT_MS)
    }

    fun waitFor(matcher: SemanticsMatcher, timeoutMs: Long = SERVER_TIMEOUT_MS) {
        compose.waitUntil(timeoutMs) { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
    }

    fun waitForNo(matcher: SemanticsMatcher, timeoutMs: Long = SERVER_TIMEOUT_MS) {
        compose.waitUntil(timeoutMs) { compose.onAllNodes(matcher).fetchSemanticsNodes().isEmpty() }
    }

    fun tagged(tag: String) = compose.onNodeWithTag(tag)

    /** Clicks a node, first scrolling it into view if it is in a scrolling screen. */
    fun click(matcher: SemanticsMatcher) {
        if (compose.onAllNodes(matcher and hasAnyAncestor(hasScrollAction())).fetchSemanticsNodes().isNotEmpty()) {
            compose.onNode(matcher).performScrollTo()
        }
        compose.onNode(matcher).performClick()
    }

    fun clickTag(tag: String) = click(hasTestTag(tag))

    fun clickText(text: String) = click(hasText(text) and hasClickAction())

    /** Replaces a text field's contents. */
    fun typeInto(tag: String, text: String) {
        tagged(tag).performScrollTo().performTextClearance()
        tagged(tag).performTextInput(text)
    }

    /** Scrolls the screen's list (the itinerary, the activities, ...) until a matching item is composed. */
    fun scrollListTo(matcher: SemanticsMatcher) {
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(matcher)
    }

    /** Opens the Trip Builder's date picker and chooses the first and last day of the trip. */
    fun chooseTripDates(start: LocalDate, end: LocalDate) {
        clickTag(TestTags.TRIP_DATES_BUTTON)
        pickDay(start)
        pickDay(end)
        compose.onNode(hasText("Done") and hasClickAction()).performClick()
    }

    /** Opens one of the Trip Builder's time dropdowns ("Start", "Arrive", ...) and picks a time from its menu. */
    fun chooseTime(field: String, time: String) {
        click(hasText(field))
        click(hasText(time) and hasClickAction())
    }

    /** The "13:05 to 14:35" lines of the stops shown, in order. */
    fun stopTimes(): List<String> = compose.onAllNodes(stopTime()).fetchSemanticsNodes().map { node ->
        node.config.getOrNull(SemanticsProperties.Text).orEmpty().joinToString(" ") { it.text }
    }

    fun stopTime() = SemanticsMatcher("is a stop's time") { node ->
        node.config.getOrNull(SemanticsProperties.Text).orEmpty().any { STOP_TIME.matches(it.text) }
    } and hasAnyAncestor(hasTestTag(TestTags.ITINERARY_STOP))

    private fun pickDay(date: LocalDate) {
        val day = hasText(date.format(PICKER_DAY), substring = true) and hasClickAction()
        scrollListTo(day)
        compose.onNode(day).performClick()
    }
}
