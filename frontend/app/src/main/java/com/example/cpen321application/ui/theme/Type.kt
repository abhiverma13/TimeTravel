package com.example.cpen321application.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.cpen321application.R

/** Archivo Black: the chunky headline face. */
val Archivo = FontFamily(Font(R.font.archivo_black))

/** Space Grotesk: titles, body and buttons. */
val Grotesk = FontFamily(
    Font(R.font.space_grotesk_regular, FontWeight.Normal),
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_bold, FontWeight.Bold),
)

/** Space Mono: times, counts and small labels. */
val Mono = FontFamily(
    Font(R.font.space_mono_regular, FontWeight.Normal),
    Font(R.font.space_mono_bold, FontWeight.Bold),
)

// Big, tight headlines in Archivo Black; Space Grotesk for reading; Space Mono for the small print.
val Typography = Typography(
    displayLarge = TextStyle(fontFamily = Archivo, fontSize = 56.sp, lineHeight = 54.sp, letterSpacing = (-2).sp),
    displayMedium = TextStyle(fontFamily = Archivo, fontSize = 46.sp, lineHeight = 46.sp, letterSpacing = (-1.5).sp),
    displaySmall = TextStyle(fontFamily = Archivo, fontSize = 36.sp, lineHeight = 38.sp, letterSpacing = (-1).sp),
    headlineLarge = TextStyle(fontFamily = Archivo, fontSize = 32.sp, lineHeight = 34.sp, letterSpacing = (-1).sp),
    headlineMedium = TextStyle(fontFamily = Archivo, fontSize = 27.sp, lineHeight = 30.sp, letterSpacing = (-0.6).sp),
    headlineSmall = TextStyle(fontFamily = Archivo, fontSize = 23.sp, lineHeight = 26.sp, letterSpacing = (-0.4).sp),
    titleLarge = TextStyle(fontFamily = Archivo, fontSize = 20.sp, lineHeight = 24.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = Grotesk, fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = Grotesk, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = Grotesk, fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp),
)
