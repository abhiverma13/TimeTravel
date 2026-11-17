package com.example.cpen321application.ui

import android.net.Uri
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Luggage
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.cpen321application.data.NotificationAreas
import com.example.cpen321application.ui.builder.TripBuilderScreen
import com.example.cpen321application.ui.builder.TripBuilderViewModel
import com.example.cpen321application.ui.builder.TripGroup
import com.example.cpen321application.ui.common.FullScreenLoading
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.appViewModel
import com.example.cpen321application.ui.explore.ExploreScreen
import com.example.cpen321application.ui.explore.ExploreViewModel
import com.example.cpen321application.ui.feed.FeedScreen
import com.example.cpen321application.ui.feed.FeedViewModel
import com.example.cpen321application.ui.feed.PostNavigation
import com.example.cpen321application.ui.feed.PostScreen
import com.example.cpen321application.ui.feed.PostViewModel
import com.example.cpen321application.ui.feed.SharePostViewModel
import com.example.cpen321application.ui.feed.TakersScreen
import com.example.cpen321application.ui.feed.TakersViewModel
import com.example.cpen321application.ui.friends.FindFriendsScreen
import com.example.cpen321application.ui.friends.FindFriendsViewModel
import com.example.cpen321application.ui.friends.TravellerScreen
import com.example.cpen321application.ui.friends.TravellerViewModel
import com.example.cpen321application.ui.groups.GroupDetailActions
import com.example.cpen321application.ui.groups.GroupDetailScreen
import com.example.cpen321application.ui.groups.GroupDetailViewModel
import com.example.cpen321application.ui.groups.GroupsTab
import com.example.cpen321application.ui.groups.GroupsViewModel
import com.example.cpen321application.ui.home.HomeActions
import com.example.cpen321application.ui.home.HomeScreen
import com.example.cpen321application.ui.home.HomeViewModel
import com.example.cpen321application.ui.home.ProfileDialog
import com.example.cpen321application.ui.map.MapScreen
import com.example.cpen321application.ui.map.MapViewModel
import com.example.cpen321application.ui.nearby.NearbyViewModel
import com.example.cpen321application.ui.notifications.UnreadViewModel
import com.example.cpen321application.ui.profile.ProfileActions
import com.example.cpen321application.ui.profile.ProfileScreen
import com.example.cpen321application.ui.profile.ProfileViewModel
import com.example.cpen321application.ui.signin.SignInScreen
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun
import com.example.cpen321application.ui.theme.Tangerine
import com.example.cpen321application.ui.trip.TripDependencies
import com.example.cpen321application.ui.trip.TripScreen
import com.example.cpen321application.ui.trip.TripViewModel

private object Routes {
    const val HOME = "home"
    const val EXPLORE = "explore"
    const val PROFILE = "profile"
    const val FEED = "feed"
    const val POST_ID = "postId"
    const val POST = "post/{$POST_ID}"
    const val POST_TAKERS = "post/{$POST_ID}/takers"
    const val FIND_FRIENDS = "findFriends"
    const val USER_ID = "userId"
    const val TRAVELLER = "traveller/{$USER_ID}"
    const val GROUPS = "groups"
    const val GROUP_ID = "groupId"
    const val GROUP_NAME = "groupName"
    const val GROUP = "group/{$GROUP_ID}"
    const val TRIP_BUILDER = "tripBuilder?$GROUP_ID={$GROUP_ID}&$GROUP_NAME={$GROUP_NAME}"
    const val TRIP_ID = "tripId"
    const val TRIP = "trip/{$TRIP_ID}"
    const val TRIP_MAP = "trip/{$TRIP_ID}/map"

    fun trip(tripId: String) = "trip/$tripId"

    fun tripMap(tripId: String) = "trip/$tripId/map"

    fun group(groupId: String) = "group/$groupId"

    fun traveller(userId: String) = "traveller/$userId"

    fun post(postId: String) = "post/$postId"

    fun postTakers(postId: String) = "post/$postId/takers"

    fun tripBuilder(group: TripGroup? = null) =
        if (group == null) "tripBuilder" else "tripBuilder?$GROUP_ID=${group.id}&$GROUP_NAME=${Uri.encode(group.name)}"
}

// Used to prefill searches until the traveller sets a home city.
private const val DEFAULT_CITY = "Vancouver"

/**
 * A destination in the bottom navigation bar; `area` is the part of the app whose unread notifications give it a red dot,
 * and `color` fills its block in the bar and the highlighter under its headline.
 */
class Tab(val route: String, val label: String, val icon: ImageVector, val testTag: String, val area: String?, val color: Color)

private val TABS = listOf(
    Tab(Routes.HOME, "Trips", Icons.Filled.Luggage, TestTags.TAB_TRIPS, NotificationAreas.TRIPS, Lime),
    Tab(Routes.EXPLORE, "Explore", Icons.Filled.Explore, TestTags.TAB_EXPLORE, null, Sky),
    Tab(Routes.GROUPS, "Groups", Icons.Filled.Groups, TestTags.TAB_GROUPS, NotificationAreas.GROUPS, Tangerine),
    Tab(Routes.FEED, "Feed", Icons.Filled.DynamicFeed, TestTags.TAB_FEED, NotificationAreas.FEED, Pink),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.AccountBox, TestTags.TAB_PROFILE, NotificationAreas.PROFILE, Sun),
)

/** Shows sign-in until there is a session, then the signed-in screens. */
@Composable
fun TimeTravelApp() {
    val session = appViewModel { SessionViewModel(it.repository, it.liveEvents) }
    val state by session.state.collectAsState()
    val activity = LocalActivity.current

    when (val current = state) {
        SessionState.Checking -> FullScreenLoading()
        is SessionState.SignedOut -> SignInScreen(
            signingIn = current.signingIn,
            message = current.message,
            signInConfigured = session.isSignInConfigured,
            onSignIn = { activity?.let(session::signIn) },
        )
        is SessionState.SignedIn -> {
            SignedInScreens(session = current, viewModel = session)
            if (current.editingProfile) {
                ProfileDialog(
                    user = current.user,
                    saving = current.savingProfile,
                    error = current.profileError,
                    onSave = session::saveProfile,
                    onDismiss = session::cancelProfileEdit,
                )
            }
        }
    }
}

// The tabs show the bottom bar; screens opened from them cover it until the traveller goes back. Live events from other
// travellers ("Ava joined Crew") show briefly over whichever screen is open, and a red dot marks each tab with something
// new until the traveller opens it.
@Composable
private fun SignedInScreens(session: SessionState.SignedIn, viewModel: SessionViewModel) {
    val navController = rememberNavController()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val unread = appViewModel(key = "unread-${session.user.id}") { UnreadViewModel(it.notifications, it.liveEvents.events) }
    val unreadState by unread.state.collectAsState()
    val openArea = TABS.firstOrNull { it.route == currentRoute }?.area
    val waiting = openArea?.let { unreadState.counts[it] } ?: 0
    LaunchedEffect(openArea) { openArea?.let { unread.open(it, sameVisit = false) } }
    LaunchedEffect(openArea, waiting) { if (openArea != null && waiting > 0) unread.open(openArea, sameVisit = true) }
    val selectTab: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    val notices = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        viewModel.liveEvents.collect { event -> notices.showSnackbar(event.text) }
    }
    Scaffold(
        snackbarHost = { NeoSnackbarHost(notices, modifier = Modifier.testTag(TestTags.LIVE_EVENT_NOTICE)) },
        bottomBar = {
            if (TABS.any { it.route == currentRoute }) {
                TabBar(TABS, currentRoute, unreadState.counts, selectTab)
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(innerPadding).consumeWindowInsets(innerPadding),
        ) {
            tabScreens(navController, session, viewModel, TabExtras(unread, selectTab))
            tripScreens(navController, session)
            groupScreens(navController, session)
            friendScreens(navController)
            feedScreens(navController, unread)
        }
    }
}

/** What the tabs need besides navigation: the red dots, and a way to switch tab from inside one. */
private class TabExtras(val unread: UnreadViewModel, val selectTab: (String) -> Unit)

private fun NavGraphBuilder.tabScreens(
    navController: NavHostController,
    session: SessionState.SignedIn,
    viewModel: SessionViewModel,
    extras: TabExtras,
) {
    composable(Routes.HOME) {
        val home = appViewModel { HomeViewModel(it.repository, it.liveEvents.events) }
        val recentTrips by home.recentTrips.collectAsState()
        val deleteError by home.deleteError.collectAsState()
        LaunchedEffect(Unit) { home.refresh() }
        HomeScreen(
            user = session.user,
            recentTrips = recentTrips,
            newTripIds = extras.unread.state.collectAsState().value.freshIn(NotificationAreas.TRIPS).mapNotNull { it.tripId }.toSet(),
            actions = HomeActions(
                onPlanTrip = { navController.navigate(Routes.tripBuilder()) },
                onGroups = { extras.selectTab(Routes.GROUPS) },
                onOpenTrip = { navController.navigate(Routes.trip(it)) },
                onDeleteTrip = home::deleteTrip,
            ),
            deleteError = deleteError,
        )
    }
    composable(Routes.EXPLORE) {
        val startCity = session.user.homeCity.ifBlank { DEFAULT_CITY }
        ExploreScreen(viewModel = appViewModel { ExploreViewModel(it.repository, startCity) })
    }
    composable(Routes.GROUPS) {
        GroupsTab(
            groups = appViewModel { GroupsViewModel(it.groups, it.liveEvents.events) },
            nearby = appViewModel { NearbyViewModel(it.nearby, it.liveEvents.events) },
            newGroupIds = extras.unread.state.collectAsState().value.freshIn(NotificationAreas.GROUPS).mapNotNull { it.groupId }.toSet(),
            onOpenGroup = { groupId -> navController.navigate(Routes.group(groupId)) },
        )
    }
    composable(Routes.PROFILE) {
        ProfileScreen(
            user = session.user,
            viewModel = appViewModel { ProfileViewModel(it.friends, it.liveEvents.events) },
            actions = ProfileActions(
                onEditProfile = viewModel::editProfile,
                onSignOut = viewModel::signOut,
                onFindFriends = { navController.navigate(Routes.FIND_FRIENDS) },
                onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
            ),
        )
    }
}

private fun NavGraphBuilder.friendScreens(navController: NavHostController) {
    composable(Routes.FIND_FRIENDS) {
        FindFriendsScreen(
            viewModel = appViewModel { FindFriendsViewModel(it.friends) },
            onBack = navController::popBackStack,
            onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
        )
    }
    composable(Routes.TRAVELLER) { entry ->
        val userId = entry.arguments?.getString(Routes.USER_ID).orEmpty()
        TravellerScreen(
            viewModel = appViewModel(key = "traveller-$userId") { TravellerViewModel(it.friends, it.posts, userId, it.liveEvents.events) },
            onBack = navController::popBackStack,
            onOpenPost = { navController.navigate(Routes.post(it)) },
            onOpenTakers = { navController.navigate(Routes.postTakers(it)) },
        )
    }
}

private fun NavGraphBuilder.feedScreens(navController: NavHostController, unread: UnreadViewModel) {
    composable(Routes.FEED) {
        FeedScreen(
            viewModel = appViewModel { FeedViewModel(it.posts) },
            onOpenPost = { navController.navigate(Routes.post(it)) },
            onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
            onOpenTakers = { navController.navigate(Routes.postTakers(it)) },
            newOnYourPosts = unread.state.collectAsState().value.freshIn(NotificationAreas.FEED),
        )
    }
    composable(Routes.POST) { entry ->
        val postId = entry.arguments?.getString(Routes.POST_ID).orEmpty()
        PostScreen(
            viewModel = appViewModel(key = "post-$postId") { PostViewModel(it.posts, postId, it.liveEvents.events) },
            navigation = PostNavigation(
                onBack = navController::popBackStack,
                onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
                onOpenTrip = { navController.navigate(Routes.trip(it)) },
                onOpenTakers = { navController.navigate(Routes.postTakers(it)) },
            ),
        )
    }
    composable(Routes.POST_TAKERS) { entry ->
        val postId = entry.arguments?.getString(Routes.POST_ID).orEmpty()
        TakersScreen(
            viewModel = appViewModel(key = "takers-$postId") { TakersViewModel(it.posts, postId) },
            onBack = navController::popBackStack,
            onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
        )
    }
}

private fun NavGraphBuilder.tripScreens(navController: NavHostController, session: SessionState.SignedIn) {
    composable(
        Routes.TRIP_BUILDER,
        arguments = listOf(
            navArgument(Routes.GROUP_ID) { type = NavType.StringType; nullable = true },
            navArgument(Routes.GROUP_NAME) { type = NavType.StringType; nullable = true },
        ),
    ) { entry ->
        val city = session.user.homeCity.ifBlank { DEFAULT_CITY }
        val groupId = entry.arguments?.getString(Routes.GROUP_ID)
        val group = groupId?.let { TripGroup(it, entry.arguments?.getString(Routes.GROUP_NAME).orEmpty()) }
        TripBuilderScreen(
            viewModel = appViewModel(key = "trip-$groupId") { TripBuilderViewModel(it.repository, city, session.user.interests, group) },
            onBack = navController::popBackStack,
            onTripReady = { tripId ->
                navController.navigate(Routes.trip(tripId)) {
                    popUpTo(Routes.TRIP_BUILDER) { inclusive = true }
                }
            },
        )
    }
    composable(Routes.TRIP) { entry ->
        val tripId = entry.arguments?.getString(Routes.TRIP_ID).orEmpty()
        TripScreen(
            viewModel = appViewModel(key = tripId) {
                TripViewModel(TripDependencies(it.repository, it.groups, it.liveTrips, session.user.id), tripId)
            },
            share = appViewModel(key = "share-$tripId") { SharePostViewModel(it.posts, tripId) },
            onBack = navController::popBackStack,
            onOpenMap = { navController.navigate(Routes.tripMap(tripId)) },
        )
    }
    composable(Routes.TRIP_MAP) { entry ->
        val tripId = entry.arguments?.getString(Routes.TRIP_ID).orEmpty()
        MapScreen(
            viewModel = appViewModel(key = "map-$tripId") { MapViewModel(it.repository, it.liveTrips, tripId) },
            onBack = navController::popBackStack,
        )
    }
}

private fun NavGraphBuilder.groupScreens(navController: NavHostController, session: SessionState.SignedIn) {
    composable(Routes.GROUP) { entry ->
        val groupId = entry.arguments?.getString(Routes.GROUP_ID).orEmpty()
        GroupDetailScreen(
            viewModel = appViewModel(key = "group-$groupId") {
                GroupDetailViewModel(it.groups, it.repository, it.nearby, groupId, session.user.id, it.liveEvents.events)
            },
            actions = GroupDetailActions(
                onBack = navController::popBackStack,
                onPlanTrip = { id, name -> navController.navigate(Routes.tripBuilder(TripGroup(id, name))) },
                onOpenTrip = { navController.navigate(Routes.trip(it)) },
            ),
        )
    }
}
