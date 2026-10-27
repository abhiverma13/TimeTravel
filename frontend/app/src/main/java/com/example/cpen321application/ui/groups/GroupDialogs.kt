package com.example.cpen321application.ui.groups

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.TestTags

/** The one-field dialog behind "Create a group" and "Join with a code". */
@Composable
fun GroupTextDialog(dialog: GroupsDialog, working: Boolean, error: String?, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable(dialog) { mutableStateOf("") }
    val creating = dialog == GroupsDialog.CREATE
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (creating) "Create a group" else "Join a group") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    if (creating) {
                        "Friends join with the group's invite code, and everyone's interests shape its trips."
                    } else {
                        "Type the 6-character invite code a friend shared with you."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text(if (creating) "Group name" else "Invite code") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        capitalization = if (creating) KeyboardCapitalization.Words else KeyboardCapitalization.Characters,
                    ),
                    modifier = Modifier.fillMaxWidth().testTag(if (creating) TestTags.GROUP_NAME_FIELD else TestTags.GROUP_CODE_FIELD),
                )
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag(TestTags.GROUP_DIALOG_ERROR))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(text) }, enabled = !working, modifier = Modifier.testTag(TestTags.GROUP_DIALOG_CONFIRM)) {
                Text(if (working) "Please wait..." else if (creating) "Create" else "Join")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Asks before something that cannot be undone, such as leaving or deleting a group. */
@Composable
fun ConfirmDialog(title: String, message: String, confirmLabel: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.testTag(TestTags.CONFIRM_BUTTON)) {
                Text(confirmLabel, color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
