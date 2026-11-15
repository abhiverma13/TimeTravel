package com.example.cpen321application.ui.groups

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.example.cpen321application.ui.common.NeoSegmented
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.nearby.NearbyScreen
import com.example.cpen321application.ui.nearby.NearbyViewModel

private enum class GroupsSection(val label: String, val testTag: String) {
    MINE("My groups", TestTags.GROUPS_SECTION_MINE),
    NEARBY("Nearby trips", TestTags.GROUPS_SECTION_NEARBY),
}

/** The Groups tab: the traveller's groups, and group trips nearby that welcome new members. */
@Composable
fun GroupsTab(groups: GroupsViewModel, nearby: NearbyViewModel, newGroupIds: Set<String>, onOpenGroup: (String) -> Unit) {
    var section by rememberSaveable { mutableStateOf(GroupsSection.MINE) }
    val switcher = @Composable { SectionSwitcher(section) { section = it } }
    when (section) {
        GroupsSection.MINE -> GroupsScreen(groups, onBack = null, onOpenGroup = onOpenGroup, newGroupIds = newGroupIds, header = switcher)
        GroupsSection.NEARBY -> NearbyScreen(nearby, title = "Groups", header = switcher)
    }
}

@Composable
private fun SectionSwitcher(section: GroupsSection, onSelect: (GroupsSection) -> Unit) {
    NeoSegmented(
        options = GroupsSection.entries.map { it to it.label },
        selected = section,
        onSelect = onSelect,
        tagFor = { it.testTag },
    )
}
