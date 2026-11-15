package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft

/** "Toronto", or why there is no city to show. */
fun travellerSubtitle(traveller: Traveller): String = when {
    traveller.homeCity.isNotBlank() -> traveller.homeCity
    traveller.isPrivate -> "Private account"
    else -> "No home city yet"
}

/** A traveller in a list: their square, name and city, and the friendship actions that fit. */
@Composable
fun TravellerRow(traveller: Traveller, busy: Boolean, onOpen: () -> Unit, onAction: (FriendAction) -> Unit) {
    NeoCard(onClick = onOpen, modifier = Modifier.fillMaxWidth().testTag(TestTags.TRAVELLER_ROW)) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            SquareAvatar(traveller.name, size = 46.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(traveller.name, style = MaterialTheme.typography.titleLarge, color = Ink)
                Text(travellerSubtitle(traveller), style = MaterialTheme.typography.labelMedium, color = InkSoft)
                FriendshipActions(traveller.friendship, busy, onAction, Modifier.padding(top = 6.dp))
            }
        }
    }
}

/** Add friend; Remove request; Accept or Decline; or Remove friend, depending on the friendship. */
@Composable
fun FriendshipActions(friendship: String, busy: Boolean, onAction: (FriendAction) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        when (friendship) {
            FRIENDSHIP_NONE -> NeoButton(
                "Add friend",
                onClick = { onAction(FriendAction.ADD) },
                enabled = !busy,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.FRIEND_ADD_BUTTON),
            )
            FRIENDSHIP_REQUESTED -> NeoButton(
                "Remove request",
                onClick = { onAction(FriendAction.REMOVE) },
                enabled = !busy,
                color = Card,
                compact = true,
            )
            FRIENDSHIP_INCOMING -> {
                NeoButton(
                    "Accept",
                    onClick = { onAction(FriendAction.ACCEPT) },
                    enabled = !busy,
                    color = Blue,
                    compact = true,
                    modifier = Modifier.testTag(TestTags.FRIEND_ACCEPT_BUTTON),
                )
                NeoButton("Decline", onClick = { onAction(FriendAction.REMOVE) }, enabled = !busy, color = Card, compact = true)
            }
            FRIENDSHIP_FRIENDS -> NeoButton(
                "Remove friend",
                onClick = { onAction(FriendAction.REMOVE) },
                enabled = !busy,
                color = Card,
                compact = true,
            )
        }
    }
}
