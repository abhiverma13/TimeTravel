package com.example.cpen321application.ui.builder

/** How the traveller gets around, with the labels the Trip Builder shows. */
val TRANSPORT_MODES = listOf("walk" to "Walk", "transit" to "Transit", "drive" to "Drive")

/** Spending per activity: any, $ (free or cheap) or $$ (nothing expensive). */
val BUDGETS = listOf("any" to "Any", "low" to "$", "medium" to "$$")

/** What the traveller wants done with one place in the must-see and avoid picker. */
enum class PlaceChoice { NEUTRAL, MUST_SEE, AVOID }

/** Tapping Must-see or Avoid picks it; tapping the one already picked clears it. */
fun PlaceChoice.toggled(choice: PlaceChoice): PlaceChoice = if (this == choice) PlaceChoice.NEUTRAL else choice

fun labelFor(options: List<Pair<String, String>>, value: String): String = options.firstOrNull { it.first == value }?.second ?: value
