package com.example.cpen321application.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

// One printed-paper look on every device: cream paper and black ink, whatever the system theme.
private val NeoColorScheme = lightColorScheme(
    primary = Blue,
    onPrimary = Card,
    primaryContainer = Lime,
    onPrimaryContainer = Ink,
    secondary = Ink,
    onSecondary = Paper,
    secondaryContainer = Lime,
    onSecondaryContainer = Ink,
    tertiary = Sun,
    onTertiary = Ink,
    tertiaryContainer = Sun,
    onTertiaryContainer = Ink,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = PaperDeep,
    onSurfaceVariant = InkSoft,
    surfaceContainerLowest = Card,
    surfaceContainerLow = Card,
    surfaceContainer = Paper,
    surfaceContainerHigh = Paper,
    surfaceContainerHighest = PaperDeep,
    outline = Ink,
    outlineVariant = Disabled,
    error = ErrorInk,
    onError = Card,
    errorContainer = ErrorWash,
    onErrorContainer = ErrorInk,
)

private val NeoShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(14.dp),
    extraLarge = RoundedCornerShape(18.dp),
)

/** TimeTravel's Neo-Brutal theme. */
@Composable
fun TimeTravelTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = NeoColorScheme, typography = Typography, shapes = NeoShapes, content = content)
}
