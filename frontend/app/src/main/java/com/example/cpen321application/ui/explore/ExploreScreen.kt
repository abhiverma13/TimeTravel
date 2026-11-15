package com.example.cpen321application.ui.explore

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.CategoryTags
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoChip
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.RatingSticker
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.categoryColor
import com.example.cpen321application.ui.common.communityTagsText
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.durationText
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.common.openingTodayText
import com.example.cpen321application.ui.common.scoreText
import com.example.cpen321application.ui.map.LOCATION_PERMISSIONS
import com.example.cpen321application.ui.map.hasLocationPermission
import com.example.cpen321application.ui.map.requestCurrentLocation
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun

private val Gutter = 18.dp

@Composable
fun ExploreScreen(viewModel: ExploreViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var permitted by remember { mutableStateOf(hasLocationPermission(context)) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permitted = results.values.any { it }
    }
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(state.confirmation) {
        val confirmation = state.confirmation
        if (confirmation != null) {
            snackbarHostState.showSnackbar(confirmation)
            viewModel.confirmationShown()
        }
    }

    Scaffold(
        topBar = { NeoTopBar(title = "Explore & review", accent = Sky) },
        snackbarHost = { NeoSnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { CitySearch(state.city, state.loading, viewModel::onCityChange, viewModel::search) }
            item { InterestFilter(state.interest, viewModel::onInterestSelected) }
            exploreResults(state, CardActions(onRate = viewModel::startRating, onAdd = viewModel::startAddToTrip, onReviews = viewModel::openReviews))
        }
    }

    ExploreDialogs(state, viewModel, onAllowLocation = if (permitted) null else ({ askPermission.launch(LOCATION_PERMISSIONS) }))
}

// Adding a place to a trip, rating it, or reading its reviews, when one is open.
@Composable
private fun ExploreDialogs(state: ExploreUiState, viewModel: ExploreViewModel, onAllowLocation: (() -> Unit)?) {
    val context = LocalContext.current
    state.adding?.let { adding ->
        AddToTripDialog(adding, viewModel::chooseTrip, viewModel::addToDay, viewModel::dismissAddToTrip)
    }
    val rating = state.rating
    if (rating != null) {
        RateActivityDialog(
            activity = rating,
            submitting = state.submittingReview,
            error = state.reviewError,
            onSubmit = { stars, comment, tags ->
                viewModel.submitReview(stars, comment, tags) { done ->
                    if (hasLocationPermission(context)) requestCurrentLocation(context, done) else done(null)
                }
            },
            onDismiss = viewModel::dismissRating,
            onAllowLocation = onAllowLocation,
        )
    }
    state.reviewsOf?.let { activity -> ReviewsDialog(activity, state.reviews, onDismiss = viewModel::closeReviews) }
}

/** What an activity card can ask for. */
private class CardActions(val onRate: (TravelActivity) -> Unit, val onAdd: (TravelActivity) -> Unit, val onReviews: (TravelActivity) -> Unit)

private fun LazyListScope.exploreResults(state: ExploreUiState, actions: CardActions) {
    val inset = Modifier.padding(horizontal = Gutter)
    when {
        state.loading -> item {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 32.dp), contentAlignment = Alignment.Center) { NeoLoader() }
        }
        state.error != null -> item { ErrorNote(state.error, modifier = inset, tag = TestTags.EXPLORE_ERROR) }
        state.searchedCity == null -> item { EmptyNote("Search a city to see its best-rated activities.", modifier = inset) }
        state.activities.isEmpty() -> item {
            EmptyNote("No activities found for ${state.searchedCity}.", modifier = inset, tag = TestTags.EXPLORE_EMPTY)
        }
        else -> {
            item { SectionHeader("Best-rated in ${state.searchedCity}", Sky, modifier = inset.padding(top = 6.dp)) }
            items(state.activities, key = { it.id }) { activity ->
                ActivityCard(activity = activity, actions = actions, modifier = inset)
            }
        }
    }
}

@Composable
private fun CitySearch(city: String, loading: Boolean, onCityChange: (String) -> Unit, onSearch: () -> Unit) {
    Row(
        modifier = Modifier.padding(horizontal = Gutter),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        TextField(
            value = city,
            onValueChange = onCityChange,
            label = { Text("City") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            textStyle = MaterialTheme.typography.titleMedium,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).neoField().testTag(TestTags.EXPLORE_CITY_FIELD),
        )
        NeoButton(
            "Search",
            onClick = onSearch,
            enabled = !loading,
            color = Blue,
            modifier = Modifier.height(56.dp).testTag(TestTags.EXPLORE_SEARCH_BUTTON),
        )
    }
}

// Interest filters run edge to edge; each fills with its interest's colour when chosen.
@Composable
private fun InterestFilter(selected: String?, onSelect: (String?) -> Unit) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 2.dp, bottom = 6.dp),
    ) {
        item {
            NeoChip(label = "All", selected = selected == null, onClick = { onSelect(null) }, color = Ink)
        }
        items(INTEREST_LABELS) { (tag, label) ->
            NeoChip(label = label, selected = selected == tag, onClick = { onSelect(tag) }, color = categoryColor(tag))
        }
    }
}

// The name comes first in the card (the tests read it from there); the rating sticker is pinned to its corner.
@Composable
private fun ActivityCard(activity: TravelActivity, actions: CardActions, modifier: Modifier = Modifier) {
    NeoCard(modifier = modifier.fillMaxWidth().testTag(TestTags.ACTIVITY_CARD)) {
        Box(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(activity.name, style = MaterialTheme.typography.headlineSmall, color = Ink, modifier = Modifier.padding(end = 70.dp))
                CategoryTags(activity.interests)
                Text(ratingCounts(activity), style = MaterialTheme.typography.labelMedium, color = Ink)
                val tags = communityTagsText(activity.communityTags)
                if (tags.isNotEmpty()) {
                    Text(tags, style = MaterialTheme.typography.titleSmall, color = Ink)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = InkSoft, modifier = Modifier.size(15.dp))
                    Text(openingTodayText(activity.openingHours), style = MaterialTheme.typography.labelSmall, color = InkSoft)
                }
            }
            RatingSticker(scoreText(activity.communityScore), modifier = Modifier.align(Alignment.TopEnd).padding(top = 14.dp, end = 14.dp))
        }
        CardButtons(activity, actions)
    }
}

// "318 ratings · 2 reviews (1 verified) · 2 h".
private fun ratingCounts(activity: TravelActivity): String = buildString {
    append(countText(activity.googleRatingCount, "rating"))
    append(" · ${countText(activity.reviewCount, "review")}")
    if (activity.verifiedReviewCount > 0) {
        append(" (${activity.verifiedReviewCount} verified)")
    }
    append(" · ${durationText(activity.durationMinutes)}")
}

@Composable
private fun CardButtons(activity: TravelActivity, actions: CardActions) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        NeoButton(
            "Reviews",
            onClick = { actions.onReviews(activity) },
            color = Card,
            compact = true,
            modifier = Modifier.testTag(TestTags.REVIEWS_BUTTON),
        )
        Spacer(modifier = Modifier.weight(1f))
        NeoButton(
            "Add to trip",
            onClick = { actions.onAdd(activity) },
            color = Lime,
            compact = true,
            modifier = Modifier.testTag(TestTags.ADD_TO_TRIP_BUTTON),
        )
        NeoButton("Rate", onClick = { actions.onRate(activity) }, color = Sun, compact = true, modifier = Modifier.testTag(TestTags.RATE_BUTTON))
    }
}
