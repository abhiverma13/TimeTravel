package com.example.cpen321application.data

/** Request and response bodies of the TimeTravel back-end REST API. */

data class GoogleSignInRequest(val idToken: String)

data class UserProfile(
    val id: String,
    val email: String,
    val name: String,
    /** Prefills Explore and the Trip Builder; empty until the traveller sets it. */
    val homeCity: String,
    val interests: List<String>,
)

data class ProfileUpdateRequest(val homeCity: String, val interests: List<String>)

data class SignInResponse(val token: String, val user: UserProfile)

/** The JSON body the back-end sends with every 4xx/5xx response. */
data class ErrorResponse(val error: String?, val details: List<String>?)
