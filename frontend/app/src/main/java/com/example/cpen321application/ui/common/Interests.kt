package com.example.cpen321application.ui.common

import java.util.Locale

/** The interest tags the back-end understands, with the label the app shows for each. */
val INTEREST_LABELS: List<Pair<String, String>> = listOf(
    "museums" to "Museums",
    "outdoors" to "Outdoors",
    "food" to "Food",
    "shopping" to "Shopping",
    "landmarks" to "Landmarks",
    "nightlife" to "Nightlife",
    "family" to "Family",
)

fun interestLabel(tag: String): String =
    INTEREST_LABELS.firstOrNull { (key, _) -> key == tag }?.second ?: tag.replaceFirstChar { it.titlecase(Locale.ROOT) }
