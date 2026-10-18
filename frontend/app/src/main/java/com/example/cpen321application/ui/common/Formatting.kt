package com.example.cpen321application.ui.common

import com.example.cpen321application.data.CommunityTags
import com.example.cpen321application.data.OpeningPeriod
import java.time.LocalDate
import java.util.Locale

private const val MINUTES_PER_HOUR = 60
private const val MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
private const val DAYS_PER_WEEK = 7

/** 570 becomes "09:30". */
fun clockTime(minutes: Int): String =
    String.format(Locale.ROOT, "%02d:%02d", minutes / MINUTES_PER_HOUR, minutes % MINUTES_PER_HOUR)

/** 90 becomes "1 h 30", 120 becomes "2 h", 45 becomes "45 min" (the presentation's style). */
fun durationText(minutes: Int): String {
    val hours = minutes / MINUTES_PER_HOUR
    val remainder = minutes % MINUTES_PER_HOUR
    return when {
        hours == 0 -> "$remainder min"
        remainder == 0 -> "$hours h"
        else -> "$hours h $remainder"
    }
}

/** "1 review", "3 reviews". */
fun countText(count: Int, noun: String): String = if (count == 1) "1 $noun" else "$count ${noun}s"

fun scoreText(score: Double): String = String.format(Locale.ROOT, "%.1f", score)

/** The back-end numbers weekdays from 0 = Sunday. */
fun backendWeekday(date: LocalDate): Int = date.dayOfWeek.value % DAYS_PER_WEEK

/** "Open today 10:00 to 17:00", "Closed today", "Open 24 hours" or "Hours not listed". */
fun openingTodayText(openingHours: List<OpeningPeriod>?, today: LocalDate = LocalDate.now()): String {
    if (openingHours == null) {
        return "Hours not listed"
    }
    val windows = openingHours.filter { it.day == backendWeekday(today) }
    return when {
        windows.isEmpty() -> "Closed today"
        windows.any { it.openMinute == 0 && it.closeMinute == MINUTES_PER_DAY } -> "Open 24 hours"
        else -> "Open today " + windows.joinToString(", ") { "${clockTime(it.openMinute)} to ${clockTime(it.closeMinute)}" }
    }
}

/** The labels shown for review tag values, in the order the rating dialog offers them. */
val BEST_TIME_LABELS = listOf("morning" to "Morning", "afternoon" to "Afternoon", "evening" to "Evening")
val COST_LABELS = listOf("free" to "Free", "low" to "$", "medium" to "$$", "high" to "$$$")
val SETTING_LABELS = listOf("indoor" to "Indoor", "outdoor" to "Outdoor")

private fun labelFor(labels: List<Pair<String, String>>, value: String?): String? =
    labels.firstOrNull { (key, _) -> key == value }?.second

/** "Best in the morning · Indoor · $", from what travellers reported; empty when nothing is reported yet. */
fun communityTagsText(tags: CommunityTags?): String = listOfNotNull(
    labelFor(BEST_TIME_LABELS, tags?.bestTimeOfDay)?.let { "Best in the ${it.lowercase(Locale.ROOT)}" },
    labelFor(SETTING_LABELS, tags?.setting),
    labelFor(COST_LABELS, tags?.cost),
).joinToString(" · ")
