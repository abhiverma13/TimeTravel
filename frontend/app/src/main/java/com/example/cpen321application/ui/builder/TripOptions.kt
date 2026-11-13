package com.example.cpen321application.ui.trip

/** How the traveller gets around, with the labels the Trip Builder shows. */
val TRANSPORT_MODES = listOf("walk" to "Walk", "transit" to "Transit", "drive" to "Drive")

/** Spending per activity: any, $ (free or cheap) or $$ (nothing expensive). */
val BUDGETS = listOf("any" to "Any", "low" to "$", "medium" to "$$")

/** What the traveller wants done with one place in the must-see and avoid picker. */
enum class PlaceChoice { NEUTRAL, MUST_SEE, AVOID }

/** Tapping a place cycles it: no preference, then must-see, then avoid, then back. */
fun PlaceChoice.next(): PlaceChoice = when (this) {
    PlaceChoice.NEUTRAL -> PlaceChoice.MUST_SEE
    PlaceChoice.MUST_SEE -> PlaceChoice.AVOID
    PlaceChoice.AVOID -> PlaceChoice.NEUTRAL
}

fun labelFor(options: List<Pair<String, String>>, value: String): String = options.firstOrNull { it.first == value }?.second ?: value
