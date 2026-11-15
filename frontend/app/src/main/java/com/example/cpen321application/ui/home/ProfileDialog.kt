package com.example.cpen321application.ui.home

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.InterestChips
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Sun

/** Edits the profile kept by the Auth & Profile Service: home city and interest tags. */
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

    NeoDialog(
        title = "Your profile",
        onDismissRequest = onDismiss,
        accent = Sun,
        buttons = {
            NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true)
            NeoButton(
                if (saving) "Saving..." else "Save",
                onClick = { onSave(homeCity, interests) },
                enabled = !saving,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.PROFILE_SAVE_BUTTON),
            )
        },
    ) {
        TextField(
            value = homeCity,
            onValueChange = { homeCity = it },
            label = { Text("Home city") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.PROFILE_CITY_FIELD),
        )
        SectionLabel("Interests", color = Ink)
        InterestChips(interests, onToggle = { tag -> interests = if (tag in interests) interests - tag else interests + tag })
        if (error != null) {
            ErrorNote(error)
        }
    }
}
