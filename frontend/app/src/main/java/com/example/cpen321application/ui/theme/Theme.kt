package com.example.cpen321application.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val LightColorScheme = lightColorScheme(
    primary = ForestDeep,
    onPrimary = Cream,
    primaryContainer = Sage,
    onPrimaryContainer = ForestDeep,
    secondary = Forest,
    onSecondary = Cream,
    secondaryContainer = Sage,
    onSecondaryContainer = ForestDeep,
    tertiary = Gold,
    onTertiary = Color.White,
    tertiaryContainer = Blush,
    onTertiaryContainer = Rust,
    background = Cream,
    onBackground = InkText,
    surface = Cream,
    onSurface = InkText,
    surfaceVariant = Parchment,
    onSurfaceVariant = MutedText,
    surfaceContainerLowest = CardCream,
    surfaceContainerLow = CardCream,
    surfaceContainer = Parchment,
    surfaceContainerHigh = Parchment,
    surfaceContainerHighest = Parchment,
    outline = FieldOutline,
    outlineVariant = Rule,
    error = Rust,
    errorContainer = Blush,
    onErrorContainer = Rust,
)

private val DarkColorScheme = darkColorScheme(
    primary = PineLight,
    onPrimary = ForestDeep,
    primaryContainer = Forest,
    onPrimaryContainer = Cream,
    secondary = PineMuted,
    secondaryContainer = NightPanel,
    onSecondaryContainer = PineLight,
    tertiary = GoldLight,
    background = Night,
    surface = Night,
    surfaceVariant = NightPanel,
    surfaceContainerLowest = NightCard,
    surfaceContainerLow = NightCard,
    surfaceContainer = NightPanel,
    surfaceContainerHigh = NightPanel,
    surfaceContainerHighest = NightPanel,
    error = RustLight,
)

// The presentation's boxes have nearly square corners.
private val TimeTravelShapes = Shapes(
    extraSmall = RoundedCornerShape(2.dp),
    small = RoundedCornerShape(4.dp),
    medium = RoundedCornerShape(4.dp),
    large = RoundedCornerShape(6.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

/** TimeTravel's brand theme (no wallpaper-based dynamic colour, so every device matches the presentation). */
@Composable
fun TimeTravelTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        shapes = TimeTravelShapes,
        content = content,
    )
}
