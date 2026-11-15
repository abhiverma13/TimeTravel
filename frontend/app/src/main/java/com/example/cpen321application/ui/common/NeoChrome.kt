package com.example.cpen321application.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.DatePickerColors
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwitchColors
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Disabled
import com.example.cpen321application.ui.theme.DisabledInk
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.LimeWash
import com.example.cpen321application.ui.theme.Paper
import com.example.cpen321application.ui.theme.Sun

// The highlighter slab behind a tab's title covers this band of the text's height.
private const val SLAB_TOP = 0.52f
private const val SLAB_HEIGHT = 0.4f

/** A marker-pen slab of [color] across the lower half of the text, a little wider than it. */
fun Modifier.highlighter(color: Color): Modifier = drawBehind {
    val bleed = 4.dp.toPx()
    drawRect(color, topLeft = Offset(-bleed, size.height * SLAB_TOP), size = Size(size.width + bleed * 2, size.height * SLAB_HEIGHT))
}

/**
 * The top of a screen. A tab gets a big headline on a highlighter slab of its [accent] colour; a screen opened from a tab
 * gets a square back button and a smaller title.
 */
@Composable
fun NeoTopBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    accent: Color? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (onBack != null) {
            NeoIconButton(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", onClick = onBack)
        }
        Box(Modifier.weight(1f)) {
            if (accent != null) {
                Text(title, style = MaterialTheme.typography.displaySmall, modifier = Modifier.highlighter(accent))
            } else {
                Text(title, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        actions()
    }
}

/** A dialog as a Neo card: a coloured title band, the body, then the buttons. */
@Composable
fun NeoDialog(
    title: String,
    onDismissRequest: () -> Unit,
    buttons: @Composable RowScope.() -> Unit,
    accent: Color = Sun,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier
                .padding(start = 20.dp, end = 20.dp + Neo.Shadow, top = 24.dp, bottom = 24.dp + Neo.Shadow)
                .fillMaxWidth()
                .neoBlock(Neo.CardShape, Paper, Neo.Shadow, Neo.Shadow),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall,
                color = inkOn(accent),
                modifier = Modifier.fillMaxWidth().background(accent).padding(horizontal = 18.dp, vertical = 14.dp),
            )
            Box(Modifier.fillMaxWidth().height(Neo.Border).background(Ink))
            Column(
                modifier = Modifier.weight(1f, fill = false).padding(start = 18.dp, end = 18.dp, top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                content = content,
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
                content = buttons,
            )
        }
    }
}

/** A text field's outline and shadow; pair with [neoFieldColors] and [Neo.FieldShape]. */
fun Modifier.neoField(): Modifier = neoShadow(Neo.FieldShape, Neo.SmallShadow).border(Neo.Border, Ink, Neo.FieldShape)

/** White fields that wash lime while you type in them, with no underline. */
@Composable
fun neoFieldColors(): TextFieldColors = TextFieldDefaults.colors(
    focusedContainerColor = LimeWash,
    unfocusedContainerColor = Card,
    disabledContainerColor = Disabled,
    errorContainerColor = Card,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
    disabledIndicatorColor = Color.Transparent,
    errorIndicatorColor = Color.Transparent,
    focusedLabelColor = Ink,
    unfocusedLabelColor = InkSoft,
    cursorColor = Ink,
    focusedTextColor = Ink,
    unfocusedTextColor = Ink,
    focusedTrailingIconColor = Ink,
    unfocusedTrailingIconColor = Ink,
)

/** Switches with an ink thumb on a white track, turning lime when on. */
@Composable
fun neoSwitchColors(): SwitchColors = SwitchDefaults.colors(
    checkedThumbColor = Ink,
    checkedTrackColor = Lime,
    checkedBorderColor = Ink,
    checkedIconColor = Lime,
    uncheckedThumbColor = Ink,
    uncheckedTrackColor = Card,
    uncheckedBorderColor = Ink,
    disabledCheckedTrackColor = Disabled,
    disabledUncheckedTrackColor = Disabled,
)

/** The date pickers on paper, with chosen days in blue and the range between them in lime. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun neoDatePickerColors(): DatePickerColors = DatePickerDefaults.colors(
    containerColor = Paper,
    titleContentColor = Ink,
    headlineContentColor = Ink,
    weekdayContentColor = InkSoft,
    subheadContentColor = InkSoft,
    navigationContentColor = Ink,
    yearContentColor = Ink,
    currentYearContentColor = Ink,
    selectedYearContentColor = Card,
    selectedYearContainerColor = Blue,
    dayContentColor = Ink,
    disabledDayContentColor = DisabledInk,
    selectedDayContentColor = Card,
    selectedDayContainerColor = Blue,
    todayContentColor = Ink,
    todayDateBorderColor = Ink,
    dayInSelectionRangeContentColor = Ink,
    dayInSelectionRangeContainerColor = Lime,
    dividerColor = Ink,
)

/** A dropdown menu as an outlined white card. */
@Composable
fun NeoMenu(expanded: Boolean, onDismissRequest: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismissRequest,
        shape = Neo.ButtonShape,
        containerColor = Card,
        shadowElevation = 0.dp,
        border = BorderStroke(Neo.Border, Ink),
        content = content,
    )
}
