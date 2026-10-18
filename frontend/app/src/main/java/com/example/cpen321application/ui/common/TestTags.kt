package com.example.cpen321application.ui.common

/** Stable handles for the Compose end-to-end tests in androidTest/e2e. */
object TestTags {
    const val SIGN_IN_BUTTON = "signInButton"
    const val SIGN_OUT_BUTTON = "signOutButton"

    const val PROFILE_CARD = "profileCard"
    const val PROFILE_EDIT_BUTTON = "profileEditButton"
    const val PROFILE_CITY_FIELD = "profileCityField"
    const val PROFILE_SAVE_BUTTON = "profileSaveButton"

    const val HOME_EXPLORE = "homeExplore"

    const val EXPLORE_CITY_FIELD = "exploreCityField"
    const val EXPLORE_SEARCH_BUTTON = "exploreSearchButton"
    const val EXPLORE_ERROR = "exploreError"
    const val EXPLORE_EMPTY = "exploreEmpty"
    const val ACTIVITY_CARD = "activityCard"
    const val RATE_BUTTON = "rateButton"
    const val SUBMIT_RATING_BUTTON = "submitRatingButton"

    fun ratingStar(stars: Int): String = "ratingStar$stars"
}
