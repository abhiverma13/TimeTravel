package com.example.cpen321application.data

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** A sign-in attempt that did not produce a Google ID token, with a message for the traveller. */
class SignInException(message: String) : Exception(message)

/**
 * Shows Google's sign-in sheet through Credential Manager. The "Sign in with Google" option also lets
 * a traveller add an account when none is signed in on the device.
 */
class GoogleSignInClient(private val serverClientId: String) {
    val isConfigured: Boolean
        get() = serverClientId.isNotBlank()

    suspend fun requestIdToken(activity: Activity): String {
        val option = GetSignInWithGoogleOption.Builder(serverClientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = try {
            CredentialManager.create(activity).getCredential(activity, request).credential
        } catch (error: GetCredentialException) {
            throw SignInException(messageFor(error))
        }
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            throw SignInException("Google did not return an ID token. Please try again.")
        }
        return GoogleIdTokenCredential.createFrom(credential.data).idToken
    }

    private fun messageFor(error: GetCredentialException): String = when (error) {
        is GetCredentialCancellationException -> "Sign-in was cancelled."
        is NoCredentialException -> "No Google account is available on this device."
        else -> "Google sign-in failed: ${error.message ?: error.type}"
    }
}
