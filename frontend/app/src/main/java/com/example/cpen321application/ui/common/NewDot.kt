package com.example.cpen321application.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** The red dot on a row that something new happened to since the traveller last looked. */
@Composable
fun NewDot(modifier: Modifier = Modifier) {
    RedDot(modifier.testTag(TestTags.NEW_DOT))
}
