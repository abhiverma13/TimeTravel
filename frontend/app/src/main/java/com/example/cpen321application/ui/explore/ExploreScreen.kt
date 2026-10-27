package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.communityTagsText
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.durationText
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.common.openingTodayText
import com.example.cpen321application.ui.common.scoreText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(viewModel: ExploreViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(state.confirmation) {
        val confirmation = state.confirmation
        if (confirmation != null) {
            snackbarHostState.showSnackbar(confirmation)
            viewModel.confirmationShown()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Explore & review") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { CitySearch(state.city, state.loading, viewModel::onCityChange, viewModel::search) }
            item { InterestFilter(state.interest, viewModel::onInterestSelected) }
            exploreResults(state, onRate = viewModel::startRating, onAdd = viewModel::startAddToTrip)
        }
    }

    state.adding?.let { adding ->
        AddToTripDialog(adding, viewModel::chooseTrip, viewModel::addToDay, viewModel::dismissAddToTrip)
    }

    val rating = state.rating
    if (rating != null) {
        RateActivityDialog(
            activity = rating,
            submitting = state.submittingReview,
            error = state.reviewError,
            onSubmit = viewModel::submitReview,
            onDismiss = viewModel::dismissRating,
        )
    }
}

private fun LazyListScope.exploreResults(state: ExploreUiState, onRate: (TravelActivity) -> Unit, onAdd: (TravelActivity) -> Unit) {
    when {
        state.loading -> item {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        state.error != null -> item {
            Text(state.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag(TestTags.EXPLORE_ERROR))
        }
        state.searchedCity == null -> item {
            Text("Search a city to see its best-rated activities.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        state.activities.isEmpty() -> item {
            Text("No activities found for ${state.searchedCity}.", modifier = Modifier.testTag(TestTags.EXPLORE_EMPTY))
        }
        else -> {
            item { SectionLabel("Best-rated in ${state.searchedCity}") }
            items(state.activities, key = { it.id }) { activity ->
                ActivityCard(activity = activity, onRate = { onRate(activity) }, onAdd = { onAdd(activity) })
            }
        }
    }
}

@Composable
private fun CitySearch(city: String, loading: Boolean, onCityChange: (String) -> Unit, onSearch: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = city,
            onValueChange = onCityChange,
            label = { Text("City") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).testTag(TestTags.EXPLORE_CITY_FIELD),
        )
        Button(
            onClick = onSearch,
            enabled = !loading,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.height(56.dp).testTag(TestTags.EXPLORE_SEARCH_BUTTON),
        ) {
            Text("Search")
        }
    }
}

@Composable
private fun InterestFilter(selected: String?, onSelect: (String?) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text("All") })
        }
        items(INTEREST_LABELS) { (tag, label) ->
            FilterChip(selected = selected == tag, onClick = { onSelect(tag) }, label = { Text(label) })
        }
    }
}

@Composable
private fun ActivityCard(activity: TravelActivity, onRate: () -> Unit, onAdd: () -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.ACTIVITY_CARD)) {
        Column(
            modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 4.dp, bottom = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(activity.name, style = MaterialTheme.typography.titleMedium)
            SectionLabel(activity.interests.joinToString(" · ") { interestLabel(it) })
            RatingLine(activity)
            val tags = communityTagsText(activity.communityTags)
            if (tags.isNotEmpty()) {
                Text(tags, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = openingTodayText(activity.openingHours),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onAdd, modifier = Modifier.testTag(TestTags.ADD_TO_TRIP_BUTTON)) { Text("Add to trip") }
                TextButton(onClick = onRate, modifier = Modifier.testTag(TestTags.RATE_BUTTON)) { Text("Rate") }
            }
        }
    }
}

// "★ 4.7  318 ratings · 2 reviews · 2 h", styled like the presentation's activity cards.
@Composable
private fun RatingLine(activity: TravelActivity) {
    val gold = MaterialTheme.colorScheme.tertiary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = gold, fontWeight = FontWeight.Bold)) {
                append("★ ${scoreText(activity.communityScore)}")
            }
            withStyle(SpanStyle(color = muted)) {
                append("  ${countText(activity.googleRatingCount, "rating")}")
                append(" · ${countText(activity.reviewCount, "review")}")
                append(" · ${durationText(activity.durationMinutes)}")
            }
        },
        style = MaterialTheme.typography.bodyMedium,
    )
}
