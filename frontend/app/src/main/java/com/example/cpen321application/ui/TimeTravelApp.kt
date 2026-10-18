package com.example.cpen321application.ui

import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.cpen321application.ui.common.FullScreenLoading
import com.example.cpen321application.ui.common.appViewModel
import com.example.cpen321application.ui.home.HomeScreen
import com.example.cpen321application.ui.home.ProfileDialog
import com.example.cpen321application.ui.signin.SignInScreen

private object Routes {
    const val HOME = "home"
}

/** Shows sign-in until there is a session, then the signed-in screens. */
@Composable
fun TimeTravelApp() {
    val session = appViewModel { repository -> SessionViewModel(repository) }
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

@Composable
private fun SignedInScreens(session: SessionState.SignedIn, viewModel: SessionViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(user = session.user, onEditProfile = viewModel::editProfile, onSignOut = viewModel::signOut)
        }
    }
}
