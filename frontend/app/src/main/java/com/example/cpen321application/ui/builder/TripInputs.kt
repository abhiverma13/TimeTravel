package com.example.cpen321application.ui.builder

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.clockTime
import com.example.cpen321application.ui.common.neoDatePickerColors
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private const val FIRST_SLOT_MINUTES = 6 * 60
private const val LAST_SLOT_MINUTES = 23 * 60 + 30
private const val SLOT_STEP_MINUTES = 30
private const val DATE_PICKER_HEIGHT_DP = 520

// Every half hour from 06:00 to 23:30.
private val TIME_SLOTS: List<String> = (FIRST_SLOT_MINUTES..LAST_SLOT_MINUTES step SLOT_STEP_MINUTES).map(::clockTime)

/** A read-only dropdown of half-hour times; with `notSetLabel`, the first option clears the value. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeDropdown(
    label: String,
    value: String?,
    onValueChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
    notSetLabel: String? = null,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        TextField(
            value = value ?: notSetLabel.orEmpty(),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            textStyle = MaterialTheme.typography.titleMedium.copy(fontFamily = MaterialTheme.typography.labelMedium.fontFamily),
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable).neoField(),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            shape = Neo.ButtonShape,
            containerColor = Card,
            shadowElevation = 0.dp,
            border = BorderStroke(Neo.Border, Ink),
        ) {
            if (notSetLabel != null) {
                DropdownMenuItem(text = { Text(notSetLabel) }, onClick = { onValueChange(null); expanded = false })
            }
            TIME_SLOTS.forEach { slot ->
                DropdownMenuItem(
                    text = { Text(slot, style = MaterialTheme.typography.labelMedium) },
                    onClick = { onValueChange(slot); expanded = false },
                )
            }
        }
    }
}

private fun LocalDate.toUtcMillis(): Long = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toUtcDate(): LocalDate = Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()

/** Lets the traveller pick the first and last day of the trip, from today onwards. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripDatesDialog(
    start: LocalDate?,
    end: LocalDate?,
    onConfirm: (LocalDate?, LocalDate?) -> Unit,
    onDismiss: () -> Unit,
) {
    val today = remember { LocalDate.now().toUtcMillis() }
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = start?.toUtcMillis(),
        initialSelectedEndDateMillis = end?.toUtcMillis(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis >= today
        },
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            NeoButton(
                "Done",
                onClick = { onConfirm(state.selectedStartDateMillis?.toUtcDate(), state.selectedEndDateMillis?.toUtcDate()) },
                enabled = state.selectedStartDateMillis != null,
                compact = true,
            )
        },
        dismissButton = { NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true) },
        shape = Neo.CardShape,
        colors = neoDatePickerColors(),
        modifier = Modifier.border(Neo.Border, Ink, Neo.CardShape),
    ) {
        DateRangePicker(
            state = state,
            colors = neoDatePickerColors(),
            title = {
                Text("Trip dates", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 24.dp, top = 16.dp, end = 12.dp))
            },
            modifier = Modifier.height(DATE_PICKER_HEIGHT_DP.dp),
        )
    }
}

/** Lets the traveller pick the day a copied trip starts, from today onwards. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartDateDialog(title: String, onConfirm: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val today = remember { LocalDate.now().toUtcMillis() }
    val state = rememberDatePickerState(
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis >= today
        },
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            NeoButton(
                "Done",
                onClick = { state.selectedDateMillis?.let { onConfirm(it.toUtcDate()) } },
                enabled = state.selectedDateMillis != null,
                compact = true,
            )
        },
        dismissButton = { NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true) },
        shape = Neo.CardShape,
        colors = neoDatePickerColors(),
        modifier = Modifier.border(Neo.Border, Ink, Neo.CardShape),
    ) {
        DatePicker(
            state = state,
            colors = neoDatePickerColors(),
            title = {
                Text(
                    title,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = 24.dp, top = 16.dp, end = 12.dp),
                )
            },
        )
    }
}
