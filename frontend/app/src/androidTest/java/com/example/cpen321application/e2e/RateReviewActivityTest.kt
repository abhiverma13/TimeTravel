package com.example.cpen321application.e2e

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.testing.E2eTest
import com.example.cpen321application.ui.common.TestTags
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

private const val MAX_REVIEW_LENGTH = 500
private const val STARS = 4
private const val REVIEW = "Great views, worth the walk."

/** Use Case 2, Rate & Review Activity, as designed in documentation/Testing.md section 4.2. */
@RunWith(AndroidJUnit4::class)
class RateReviewActivityTest : E2eTest() {
    @Test
    fun ratesAnActivityAndShowsTheSavedReview() {
        startOnHome()

        // Find Vancouver's activities in Explore & review.
        clickTag(TestTags.TAB_EXPLORE)
        typeInto(TestTags.EXPLORE_CITY_FIELD, "Vancouver")
        clickTag(TestTags.EXPLORE_SEARCH_BUTTON)
        waitFor(hasTestTag(TestTags.ACTIVITY_CARD))
        val activity = firstActivityName()

        // 1-2. Rate opens the dialog with Submit disabled.
        compose.onAllNodesWithTag(TestTags.RATE_BUTTON).onFirst().performClick()
        compose.onNode(hasText("Rate $activity")).assertIsDisplayed()
        tagged(TestTags.SUBMIT_RATING_BUTTON).assertIsNotEnabled()

        // 4b. Cancel closes the dialog without saving.
        clickText("Cancel")
        waitForNo(hasTestTag(TestTags.SUBMIT_RATING_BUTTON))
        compose.onAllNodesWithTag(TestTags.RATE_BUTTON).onFirst().performClick()

        // 3. Choosing stars enables Submit.
        tagged(TestTags.ratingStar(STARS)).performClick()
        tagged(TestTags.SUBMIT_RATING_BUTTON).assertIsEnabled()

        // 4a. The review stops at 500 characters.
        tagged(TestTags.REVIEW_FIELD).performTextInput("a".repeat(MAX_REVIEW_LENGTH + 20))
        assertEquals(MAX_REVIEW_LENGTH, reviewFieldText().length)

        // 4. Write a review, choose two tags and submit.
        tagged(TestTags.REVIEW_FIELD).performTextClearance()
        tagged(TestTags.REVIEW_FIELD).performTextInput(REVIEW)
        clickText("Morning")
        clickText("Outdoor")
        tagged(TestTags.SUBMIT_RATING_BUTTON).performClick()

        // 5-6. The dialog closes with a confirmation, and the review is among the activity's reviews.
        waitFor(hasText("Thanks! Your review of $activity was saved.", substring = true), timeoutMs = 25_000L)
        waitForNo(hasTestTag(TestTags.SUBMIT_RATING_BUTTON))
        val card = hasTestTag(TestTags.ACTIVITY_CARD) and hasAnyDescendant(hasText(activity))
        click(hasTestTag(TestTags.REVIEWS_BUTTON) and hasAnyAncestor(card))
        waitFor(hasText(REVIEW))
        compose.onNode(hasText("Reviews of $activity")).assertIsDisplayed()
        compose.onNode(hasText(REVIEW)).assertIsDisplayed()
        clickText("Close")
    }

    // The first activity card's name, its first line.
    private fun firstActivityName(): String {
        val name = compose.onAllNodes(hasAnyAncestor(hasTestTag(TestTags.ACTIVITY_CARD))).onFirst().fetchSemanticsNode()
        return name.config.getOrNull(SemanticsProperties.Text).orEmpty().joinToString(" ") { it.text }
    }

    private fun reviewFieldText(): String =
        tagged(TestTags.REVIEW_FIELD).fetchSemanticsNode().config.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
}
