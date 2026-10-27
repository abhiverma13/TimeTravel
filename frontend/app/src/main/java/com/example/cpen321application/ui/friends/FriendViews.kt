package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FRIENDSHIP_FRIENDS
import com.example.cpen321application.data.FRIENDSHIP_INCOMING
import com.example.cpen321application.data.FRIENDSHIP_NONE
import com.example.cpen321application.data.FRIENDSHIP_REQUESTED
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags

/** "Toronto", or why there is no city to show. */
fun travellerSubtitle(traveller: Traveller): String = when {
    traveller.homeCity.isNotBlank() -> traveller.homeCity
    traveller.isPrivate -> "Private account"
    else -> "No home city yet"
}

/** A traveller in a list: name and city, and the friendship actions that fit. */
@Composable
fun TravellerRow(traveller: Traveller, busy: Boolean, onOpen: () -> Unit, onAction: (FriendAction) -> Unit) {
    BrandCard(onClick = onOpen, modifier = Modifier.fillMaxWidth().testTag(TestTags.TRAVELLER_ROW)) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 12.dp, end = 12.dp, bottom = 8.dp)) {
            Text(traveller.name, style = MaterialTheme.typography.titleMedium)
            Text(travellerSubtitle(traveller), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FriendshipActions(traveller.friendship, busy, onAction)
        }
    }
}

/** Add friend; Cancel request; Accept or Decline; or Remove friend, depending on the friendship. */
@Composable
fun FriendshipActions(friendship: String, busy: Boolean, onAction: (FriendAction) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        when (friendship) {
            FRIENDSHIP_NONE -> Button(
                onClick = { onAction(FriendAction.ADD) },
                enabled = !busy,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.testTag(TestTags.FRIEND_ADD_BUTTON),
            ) { Text("Add friend") }
            FRIENDSHIP_REQUESTED -> OutlinedButton(onClick = { onAction(FriendAction.REMOVE) }, enabled = !busy, shape = MaterialTheme.shapes.small) {
                Text("Cancel request")
            }
            FRIENDSHIP_INCOMING -> {
                Button(
                    onClick = { onAction(FriendAction.ACCEPT) },
                    enabled = !busy,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.testTag(TestTags.FRIEND_ACCEPT_BUTTON),
                ) { Text("Accept") }
                TextButton(onClick = { onAction(FriendAction.REMOVE) }, enabled = !busy) { Text("Decline") }
            }
            FRIENDSHIP_FRIENDS -> TextButton(onClick = { onAction(FriendAction.REMOVE) }, enabled = !busy) { Text("Remove friend") }
        }
    }
}
