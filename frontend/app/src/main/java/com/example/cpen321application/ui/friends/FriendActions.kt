package com.example.cpen321application.ui.friends

import com.example.cpen321application.data.FRIENDSHIP_NONE
import com.example.cpen321application.data.FriendRepository
import com.example.cpen321application.data.Traveller

/** What the traveller can do about a friendship. */
enum class FriendAction { ADD, ACCEPT, REMOVE }

/** Carries out the action and returns the traveller as they now relate to you. */
suspend fun FriendRepository.perform(traveller: Traveller, action: FriendAction): Result<Traveller> = when (action) {
    FriendAction.ADD -> addFriend(traveller.id)
    FriendAction.ACCEPT -> accept(traveller.id)
    // A private account's city is for friends only, so it goes once you are not friends.
    FriendAction.REMOVE -> remove(traveller.id).map {
        traveller.copy(friendship = FRIENDSHIP_NONE, homeCity = if (traveller.isPrivate) "" else traveller.homeCity)
    }
}
