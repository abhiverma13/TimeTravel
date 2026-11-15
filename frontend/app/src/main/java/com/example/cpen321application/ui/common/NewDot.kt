package com.example.cpen321application.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/** The red dot on a row that something new happened to since the traveller last looked. */
@Composable
fun NewDot(modifier: Modifier = Modifier) {
    Box(modifier.size(10.dp).background(MaterialTheme.colorScheme.error, CircleShape).testTag(TestTags.NEW_DOT))
}
