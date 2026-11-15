package com.example.cpen321application.ui.groups

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.ErrorInk
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Tangerine

/** The one-field dialog behind "Create a group" and "Join with a code". */
@Composable
fun GroupTextDialog(dialog: GroupsDialog, working: Boolean, error: String?, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable(dialog) { mutableStateOf("") }
    val creating = dialog == GroupsDialog.CREATE
    NeoDialog(
        title = if (creating) "Create a group" else "Join a group",
        onDismissRequest = onDismiss,
        accent = Tangerine,
        buttons = {
            NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true)
            NeoButton(
                if (working) "Please wait..." else if (creating) "Create" else "Join",
                onClick = { onConfirm(text) },
                enabled = !working,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.GROUP_DIALOG_CONFIRM),
            )
        },
    ) {
        Text(
            if (creating) {
                "Friends join with the group's invite code, and everyone's interests shape its trips."
            } else {
                "Type the 6-character invite code a friend shared with you."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = Ink,
        )
        TextField(
            value = text,
            onValueChange = { text = it },
            label = { Text(if (creating) "Group name" else "Invite code") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            textStyle = if (creating) MaterialTheme.typography.titleMedium else MaterialTheme.typography.headlineSmall,
            keyboardOptions = KeyboardOptions(
                capitalization = if (creating) KeyboardCapitalization.Words else KeyboardCapitalization.Characters,
            ),
            modifier = Modifier.fillMaxWidth().neoField().testTag(if (creating) TestTags.GROUP_NAME_FIELD else TestTags.GROUP_CODE_FIELD),
        )
        if (error != null) {
            ErrorNote(error, tag = TestTags.GROUP_DIALOG_ERROR)
        }
    }
}

/** Asks before something that cannot be undone, such as leaving or deleting a group. */
@Composable
fun ConfirmDialog(title: String, message: String, confirmLabel: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    NeoDialog(
        title = title,
        onDismissRequest = onDismiss,
        accent = ErrorWash,
        buttons = {
            NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true)
            NeoButton(confirmLabel, onClick = onConfirm, color = ErrorInk, compact = true, modifier = Modifier.testTag(TestTags.CONFIRM_BUTTON))
        },
    ) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Ink)
    }
}
