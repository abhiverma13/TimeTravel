package com.example.cpen321application.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags

/** Edits the profile kept by the Auth & Profile Service: home city and interest tags. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileDialog(
    user: UserProfile,
    saving: Boolean,
    error: String?,
    onSave: (homeCity: String, interests: List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    var homeCity by rememberSaveable { mutableStateOf(user.homeCity) }
    var interests by rememberSaveable { mutableStateOf(user.interests) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Your profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = homeCity,
                    onValueChange = { homeCity = it },
                    label = { Text("Home city") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag(TestTags.PROFILE_CITY_FIELD),
                )
                SectionLabel("Interests")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    INTEREST_LABELS.forEach { (tag, label) ->
                        FilterChip(
                            selected = tag in interests,
                            onClick = { interests = if (tag in interests) interests - tag else interests + tag },
                            label = { Text(label) },
                        )
                    }
                }
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(homeCity, interests) },
                enabled = !saving,
                modifier = Modifier.testTag(TestTags.PROFILE_SAVE_BUTTON),
            ) {
                Text(if (saving) "Saving..." else "Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
