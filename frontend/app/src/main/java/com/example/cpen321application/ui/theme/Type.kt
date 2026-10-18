package com.example.cpen321application.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val defaults = Typography()

private fun serif(style: TextStyle): TextStyle = style.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold)

// As in the presentation: bold serif for headings and place names, a plain sans for everything else.
val Typography = Typography(
    displayLarge = serif(defaults.displayLarge),
    displayMedium = serif(defaults.displayMedium),
    displaySmall = serif(defaults.displaySmall),
    headlineLarge = serif(defaults.headlineLarge),
    headlineMedium = serif(defaults.headlineMedium),
    headlineSmall = serif(defaults.headlineSmall),
    titleLarge = serif(defaults.titleLarge),
    titleMedium = serif(defaults.titleMedium),
    labelSmall = defaults.labelSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp),
)
